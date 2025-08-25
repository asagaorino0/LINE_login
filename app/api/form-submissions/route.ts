import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/server/storage';
import { insertFormSubmissionSchema } from '@/shared/schema';
import { z } from 'zod';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = insertFormSubmissionSchema.parse(body);
    
    // Verify LINE user exists
    const lineUser = await storage.getLineUser(validatedData.lineUserId);
    if (!lineUser) {
      return NextResponse.json(
        { message: "LINE user not found" },
        { status: 404 }
      );
    }
    
    const submission = await storage.createFormSubmission(validatedData);
    return NextResponse.json(submission, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Invalid submission data", errors: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to create form submission" },
      { status: 500 }
    );
  }
}