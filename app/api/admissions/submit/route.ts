import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { parentName, email, athleteName, program } = payload as {
      parentName?: string;
      email?: string;
      athleteName?: string;
      program?: string;
    };

    if (!parentName || !email || !athleteName || !program) {
      return NextResponse.json(
        { success: false, error: "Please complete the parent, email, athlete, and program fields." },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Admissions intake captured for ${athleteName} via ${program}.`,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Unable to process admissions submission." },
      { status: 500 },
    );
  }
}
