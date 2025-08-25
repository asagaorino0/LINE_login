import { type User, type InsertUser, type LineUser, type InsertLineUser, type FormSubmission, type InsertFormSubmission } from "../shared/schema.js";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getLineUser(lineUserId: string): Promise<LineUser | undefined>;
  createLineUser(user: InsertLineUser): Promise<LineUser>;
  updateLineUser(lineUserId: string, updates: Partial<InsertLineUser>): Promise<LineUser | undefined>;
  
  createFormSubmission(submission: InsertFormSubmission): Promise<FormSubmission>;
  getFormSubmissionsByLineUserId(lineUserId: string): Promise<FormSubmission[]>;
}

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
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
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

  async updateLineUser(lineUserId: string, updates: Partial<InsertLineUser>): Promise<LineUser | undefined> {
    const existingUser = this.lineUsers.get(lineUserId);
    if (!existingUser) return undefined;

    const updatedUser: LineUser = {
      ...existingUser,
      ...updates,
    };
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

export const storage = new MemStorage();
