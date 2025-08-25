import { NextRequest, NextResponse } from 'next/server';
import { storage } from '@/server/storage';

export async function GET(
  request: NextRequest,
  { params }: { params: { lineUserId: string } }
) {
  try {
    const { lineUserId } = params;
    const user = await storage.getLineUser(lineUserId);
    
    if (!user) {
      return NextResponse.json(
        { message: "LINE user not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(user);
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to retrieve LINE user" },
      { status: 500 }
    );
  }
}