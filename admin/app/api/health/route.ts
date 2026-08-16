import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      status: "healthy",
      service: "ziru-admin",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        service: "ziru-admin",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
