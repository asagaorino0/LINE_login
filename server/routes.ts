import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLineUserSchema, insertFormSubmissionSchema } from "../shared/schema.js";
import { z } from "zod";
import { sendLineMessage } from "./line.js";

export async function registerRoutes(app: Express): Promise<Server> {
  // LINE user management routes
  app.post("/api/line-users", async (req, res) => {
    try {
      const validatedData = insertLineUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getLineUser(validatedData.lineUserId);
      if (existingUser) {
        // Update existing user with new profile data
        const updatedUser = await storage.updateLineUser(validatedData.lineUserId, validatedData);
        return res.json(updatedUser);
      }
      
      // Create new user
      const newUser = await storage.createLineUser(validatedData);
      res.status(201).json(newUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid user data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create/update LINE user" });
    }
  });

  app.get("/api/line-users/:lineUserId", async (req, res) => {
    try {
      const { lineUserId } = req.params;
      const user = await storage.getLineUser(lineUserId);
      
      if (!user) {
        return res.status(404).json({ message: "LINE user not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve LINE user" });
    }
  });

  // Form submission routes
  app.post("/api/form-submissions", async (req, res) => {
    try {
      const validatedData = insertFormSubmissionSchema.parse(req.body);
      
      // Verify LINE user exists
      const lineUser = await storage.getLineUser(validatedData.lineUserId);
      if (!lineUser) {
        return res.status(404).json({ message: "LINE user not found" });
      }
      
      const submission = await storage.createFormSubmission(validatedData);
      res.status(201).json(submission);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid submission data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create form submission" });
    }
  });

  app.get("/api/form-submissions/:lineUserId", async (req, res) => {
    try {
      const { lineUserId } = req.params;
      const submissions = await storage.getFormSubmissionsByLineUserId(lineUserId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ message: "Failed to retrieve form submissions" });
    }
  });

  // LINE message sending route
  app.post("/api/line/send-message", async (req, res) => {
    try {
      const { userId, message } = req.body;
      
      if (!userId || !message) {
        return res.status(400).json({ message: "userId and message are required" });
      }
      
      console.log('📨 Attempting to send LINE message:', { userId, message });
      const success = await sendLineMessage({ userId, message });
      
      if (success) {
        res.json({ success: true, message: "Message sent successfully" });
      } else {
        res.status(500).json({ success: false, message: "Failed to send message" });
      }
    } catch (error) {
      console.error('❌ LINE message send error:', error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
