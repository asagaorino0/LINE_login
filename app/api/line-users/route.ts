import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/server/storage';
import { insertLineUserSchema } from '@/shared/schema';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = insertLineUserSchema.parse(body);
    
    // Check if user already exists
    const existingUser = await storage.getLineUser(validatedData.lineUserId);
    if (existingUser) {
      // Update existing user with new profile data
      const updatedUser = await storage.updateLineUser(validatedData.lineUserId, validatedData);
      return NextResponse.json(updatedUser);
    }
    
    // Create new user
    const newUser = await storage.createLineUser(validatedData);
    return NextResponse.json(newUser, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid user data", errors: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to create/update LINE user" },
      { status: 500 }
    );
  }
}