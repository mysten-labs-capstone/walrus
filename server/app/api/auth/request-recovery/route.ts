import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    if (!username) return NextResponse.json({ error: 'username required' }, { status: 400 });

    const normalized = String(username).toLowerCase();
    const user = await prisma.user.findUnique({
      where: { username: normalized },
      include: { securityAnswers: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (!user.securityAnswers || user.securityAnswers.length === 0) {
      return NextResponse.json({ error: 'No security questions set for this account' }, { status: 400 });
    }

    // pick a random security answer to ask
    // Deduplicate by question text to avoid returning the same visible question
    const uniqueByQuestion = Array.from(
      new Map(user.securityAnswers.map((a) => [a.question, a])).values()
    );
    const randomIndex = Math.floor(Math.random() * uniqueByQuestion.length);
    const item = uniqueByQuestion[randomIndex];

    // return question id and question text (do not return answers)
    return NextResponse.json({ userId: user.id, questionId: item.id, question: item.question });
  } catch (err) {
    console.error('request-recovery error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
