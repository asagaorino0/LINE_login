import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/server/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { lineUserId: string } }
) {
  try {
    const { lineUserId } = params;
    const submissions = await storage.getFormSubmissionsByLineUserId(lineUserId);
    return NextResponse.json(submissions);
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to retrieve form submissions" },
      { status: 500 }
    );
  }
}