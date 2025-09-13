import {
  type User,
  type InsertUser,
  type LineUser,
  type InsertLineUser,
  type FormSubmission,
  type InsertFormSubmission,
  users,
  lineUsers,
  formSubmissions,
} from "../shared/schema";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { eq } from "drizzle-orm";
import { getLineUsersByIdContainer } from "@/lib/cosmos"; // ★ 追加

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getLineUser(lineUserId: string): Promise<LineUser | undefined>;
  createLineUser(user: InsertLineUser): Promise<LineUser>;
  updateLineUser(
    lineUserId: string,
    updates: Partial<InsertLineUser>,
  ): Promise<LineUser | undefined>;
  createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission>;
  getFormSubmissionsByLineUserId(lineUserId: string): Promise<FormSubmission[]>;
}

/** ===== In-Memory Storage (開発用) ===== */
export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private lineUsers: Map<string, LineUser>;
  private formSubmissions: Map<string, FormSubmission>;
  constructor() {
    this.users = new Map();
    this.lineUsers = new Map();
    this.formSubmissions = new Map();
  }
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async getLineUser(lineUserId: string): Promise<LineUser | undefined> {
    return this.lineUsers.get(lineUserId);
  }
  async createLineUser(insertLineUser: InsertLineUser): Promise<LineUser> {
    const id = randomUUID();
    const lineUser: LineUser = {
      ...insertLineUser,
      id,
      createdAt: new Date(),
      pictureUrl: insertLineUser.pictureUrl || null,
    };
    this.lineUsers.set(insertLineUser.lineUserId, lineUser);
    return lineUser;
  }
  async updateLineUser(
    lineUserId: string,
    updates: Partial<InsertLineUser>,
  ): Promise<LineUser | undefined> {
    const existingUser = this.lineUsers.get(lineUserId);
    if (!existingUser) return undefined;
    const updatedUser: LineUser = { ...existingUser, ...updates };
    this.lineUsers.set(lineUserId, updatedUser);
    return updatedUser;
  }
  async createFormSubmission(insertSubmission: InsertFormSubmission): Promise<FormSubmission> {
    const id = randomUUID();
    const submission: FormSubmission = {
      ...insertSubmission,
      id,
      submittedAt: new Date(),
      success: true,
      additionalMessage: insertSubmission.additionalMessage || null,
    };
    this.formSubmissions.set(id, submission);
    return submission;
  }
  async getFormSubmissionsByLineUserId(lineUserId: string): Promise<FormSubmission[]> {
    return Array.from(this.formSubmissions.values()).filter(
      (submission) => submission.lineUserId === lineUserId,
    );
  }
}

/** ===== PostgreSQL (Drizzle) ===== */
export class PostgreSQLStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }
  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await getDb().insert(users).values(insertUser).returning();
    return result[0];
  }
  async getLineUser(lineUserId: string): Promise<LineUser | undefined> {
    const result = await getDb()
      .select()
      .from(lineUsers)
      .where(eq(lineUsers.lineUserId, lineUserId))
      .limit(1);
    return result[0];
  }
  async createLineUser(insertLineUser: InsertLineUser): Promise<LineUser> {
    const result = await getDb().insert(lineUsers).values(insertLineUser).returning();
    return result[0];
  }
  async updateLineUser(
    lineUserId: string,
    updates: Partial<InsertLineUser>,
  ): Promise<LineUser | undefined> {
    const result = await getDb()
      .update(lineUsers)
      .set(updates)
      .where(eq(lineUsers.lineUserId, lineUserId))
      .returning();
    return result[0];
  }
  async createFormSubmission(insertSubmission: InsertFormSubmission): Promise<FormSubmission> {
    const result = await getDb().insert(formSubmissions).values(insertSubmission).returning();
    return result[0];
  }
  async getFormSubmissionsByLineUserId(lineUserId: string): Promise<FormSubmission[]> {
    return await getDb()
      .select()
      .from(formSubmissions)
      .where(eq(formSubmissions.lineUserId, lineUserId));
  }
}

/** ===== Cosmos DB (ENVゼロ運用用) ===== */
class CosmosStorage implements IStorage {
  private container = getLineUsersByIdContainer(); // id をパーティションキーにしたコンテナを想定
  // 未使用APIはシグネチャだけ合わせて明示的に未実装エラーを投げる
  async getUser(_id: string): Promise<User | undefined> {
    throw new Error("CosmosStorage.getUser: not implemented");
  }
  async getUserByUsername(_username: string): Promise<User | undefined> {
    throw new Error("CosmosStorage.getUserByUsername: not implemented");
  }
  async createUser(_user: InsertUser): Promise<User> {
    throw new Error("CosmosStorage.createUser: not implemented");
  }
  async getLineUser(lineUserId: string): Promise<LineUser | undefined> {
    try {
      const { resource } = await this.container.item(lineUserId, lineUserId).read<LineUser>();
      return resource ?? undefined;
    } catch (e: any) {
      if (e?.code === 404) return undefined;
      throw e;
    }
  }
  async createLineUser(insertLineUser: InsertLineUser): Promise<LineUser> {
    const doc: LineUser = {
      id: insertLineUser.lineUserId,           // id = lineUserId
      lineUserId: insertLineUser.lineUserId,   // パーティションキーもこれ
      displayName: insertLineUser.displayName ?? "",
      pictureUrl: insertLineUser.pictureUrl ?? null,
      createdAt: new Date(),
    } as LineUser;
    const { resource } = await this.container.items.create(doc);
    return resource as LineUser;
  }
  async updateLineUser(
    lineUserId: string,
    updates: Partial<InsertLineUser>,
  ): Promise<LineUser | undefined> {
    const cur = await this.getLineUser(lineUserId);
    if (!cur) return undefined;
    const updated: LineUser = { ...cur, ...updates } as LineUser;
    const { resource } = await this.container.item(lineUserId, lineUserId).replace(updated);
    return resource as LineUser;
  }
  async createFormSubmission(_submission: InsertFormSubmission): Promise<FormSubmission> {
    throw new Error("CosmosStorage.createFormSubmission: not implemented");
  }
  async getFormSubmissionsByLineUserId(_lineUserId: string): Promise<FormSubmission[]> {
    throw new Error("CosmosStorage.getFormSubmissionsByLineUserId: not implemented");
  }
}

/** ===== Export: Postgres が無ければ Cosmos に自動フォールバック ===== */
const hasDb = !!process.env.DATABASE_URL;
export const storage: IStorage = hasDb ? new PostgreSQLStorage() : new CosmosStorage();
