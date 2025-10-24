import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch("http://localhost:3001/health");
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { connected: false, error: "SP not reachable" },
      { status: 503 }
    );
  }
}
