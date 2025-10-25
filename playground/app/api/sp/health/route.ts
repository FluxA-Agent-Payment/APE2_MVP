import { NextResponse } from "next/server";

export async function GET() {
  try {
    const spUrl = process.env.NEXT_PUBLIC_SP_URL || "http://localhost:3001";
    const response = await fetch(`${spUrl}/health`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: "SP not reachable" },
      { status: 503 }
    );
  }
}
