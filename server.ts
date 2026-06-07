import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
// Increase body limit to handle PDF base64 payloads
app.use(express.json({ limit: '10mb' }));

// Set port to 3001 in development (proxied by Vite), or 3000 in production
const PORT = process.env.NODE_ENV === 'production' ? 3000 : 3001;

// Initialize Google GenAI client dynamically per-request to pick up live API key updates
const getAiClient = () => {
  const currentKey = process.env.GEMINI_API_KEY;
  if (!currentKey) {
    throw new Error('GEMINI_API_KEY is missing. Please configure it in the AI Studio Settings under Secrets.');
  }
  return new GoogleGenAI({
    apiKey: currentKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Helper to check if API key exists
const checkApiKey = (req: Request, res: Response, next: Function) => {
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is missing. Please configure it in the AI Studio Settings under Secrets.'
    });
  }
  next();
};

/**
 * Route: Parse uploaded CV and generate tailored interview questions (Module 1)
 */
app.post('/api/analyse-resume', checkApiKey, async (req: Request, res: Response) => {
  try {
    const { pdfBase64, pdfMimeType, jobDescription } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: 'pdfBase64 is required' });
    }
    if (!jobDescription) {
      return res.status(400).json({ error: 'jobDescription is required' });
    }

    // Standard base64 parsing for PDF
    const resumePart = {
      inlineData: {
        mimeType: pdfMimeType || 'application/pdf',
        data: pdfBase64,
      },
    };

    const promptPart = {
      text: `You are an elite Resume Analyser technical recruiter AI. First, read and parse the candidate's resume/CV from the attachment.
Then, compare and align it against this Job Description:
"${jobDescription}"

Produce a structured JSON report. Ensure you extract the candidate's real name and email address. Count matching skills and calculate a match percentage from 0 to 100 representing their alignment.
Auto-generate a suite of exactly 8 to 12 highly targeted, professional, personalized interview questions tailored specifically to this candidate. Focus on their experience gaps, skill alignments, technical depth, or soft skills required for the role.

Response MUST be JSON aligned with this schema representation. Do not add any conversational markdown prefix/suffix outside the JSON.`,
    };

    const response = await getAiClient().models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [resumePart, promptPart],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            candidateName: {
              type: Type.STRING,
              description: 'The extracted full name of the candidate.',
            },
            email: {
              type: Type.STRING,
              description: 'The extracted email address.',
            },
            matchScore: {
              type: Type.INTEGER,
              description: 'Vibe score of CV matching the JD (0 to 100).',
            },
            skillsAnalysis: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  skill: { type: Type.STRING },
                  matched: { type: Type.BOOLEAN },
                },
                required: ['skill', 'matched'],
              },
            },
            summary: {
              type: Type.STRING,
              description: 'A robust 2-3 paragraph analysis of key strengths, timeline gaps, or unique indicators.',
            },
            interviewQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exactly 8 to 12 designed interview questions tailored to the candidate.',
            },
          },
          required: [
            'candidateName',
            'email',
            'matchScore',
            'skillsAnalysis',
            'summary',
            'interviewQuestions',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) {
      return res.status(500).json({ error: 'Emply response from Gemini API' });
    }

    const report = JSON.parse(text);
    return res.json(report);
  } catch (error: any) {
    console.error('Error in /api/analyse-resume:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to analyze resume',
    });
  }
});

/**
 * Route: Next conversational interview question generator (Module 2)
 */
app.post('/api/interview/chat', checkApiKey, async (req: Request, res: Response) => {
  try {
    const {
      messages, // array of { role: 'user'|'model', text: string }
      jobDescription,
      candidateName,
      targetQuestions, // pre-generated 8-12 target questions
      currentQuestionIndex,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const previousConversation = messages
      .map((m) => `${m.role === 'user' ? 'Candidate' : 'Interviewer'}: ${m.text}`)
      .join('\n');

    const prompt = `You are JobVibe's Live AI Interviewer. Conduct a professional, encouraging, yet thorough technical and cultural fit interview.
Candidate Name: ${candidateName || 'Candidate'}
Job Description: "${jobDescription}"

Our pool of pre-planned question guides is:
${targetQuestions ? targetQuestions.map((q: string, i: number) => `Q${i + 1}: ${q}`).join('\n') : 'Assorted recruitment questions'}

Currently we are targeting question index: ${currentQuestionIndex || 0} relative to this pool.

Here is the conversation so far:
${previousConversation}

Your Task:
Formulate the NEXT single response or follow-up question.
1. If the candidate just answered, look at their response immediately. If it was too brief, vague, or contains an interesting engineering or practical point, ask an intelligent, direct, and conversational follow-up question related to it to dig deeper.
2. If their answer was comprehensive, smoothly transition to the next guided target question from the pool.
3. Keep your tone supportive, highly professional, conversational, and respectful.
4. Keep the question crisp and short (1 to 2 sentences) so that the browser's Text-to-Speech synthesizer speaks it naturally without pausing or lag.
5. Provide ONLY the interviewer's spoken line. Do not preface it with labels like "Interviewer:". Just output the line to be spoken.`;

    const response = await getAiClient().models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        temperature: 0.7,
      },
    });

    const reply = response.text?.trim() || 'Shall we proceed to the next question?';
    return res.json({ response: reply });
  } catch (error: any) {
    console.error('Error in /api/interview/chat:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to generate interview follow-up',
    });
  }
});

/**
 * Route: Evaluate interview transcript and calculate weighted scores (Module 4)
 */
app.post('/api/scoring/evaluate', checkApiKey, async (req: Request, res: Response) => {
  try {
    const {
      transcript, // array of { role: 'user'|'model', text: string }
      jobDescription,
      candidateName,
      skillsAnalysis,
      webcamStats, // { averageEyeContact, averageSmileScore, activeSeconds }
    } = req.body;

    if (!transcript || !Array.isArray(transcript)) {
      return res.status(400).json({ error: 'transcript array is required' });
    }

    const dialog = transcript
      .map((t) => `${t.role === 'user' ? 'Candidate' : 'Interviewer'}: ${t.text}`)
      .join('\n');

    const evaluationPrompt = `You are a Principal Technical Recruiter and Performance Analyst.
Review this candidate's interview session.
Candidate Name: ${candidateName || 'Candidate'}
Job Description: "${jobDescription}"
Skills Alignment: ${JSON.stringify(skillsAnalysis || [])}

Live interview transcript:
${dialog}

Analyze their performances across these dimensions:
1. "Competency & Resume Fit" - technical rigor and alignment with required role skills based on answers.
2. "Communication & Quality" - structured explanation, conversational fluency, STAR method alignment (Situation, Task, Action, Result).

Produce a precise evaluation in JSON structure. Do not output anything outside the JSON structure.`;

    const response = await getAiClient().models.generateContent({
      model: 'gemini-3.5-flash',
      contents: evaluationPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            competencyScore: {
              type: Type.INTEGER,
              description: 'Score out of 100 for technical competency and resume alignment.',
            },
            communicationScore: {
              type: Type.INTEGER,
              description: 'Score out of 100 for clarity, structured answers, and articulating results.',
            },
            strengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'List of core strengths observed in transcripts.',
            },
            skillGaps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Identified technical, design, or behavioral skill gaps.',
            },
            qualitativeSummary: {
              type: Type.STRING,
              description: 'Comprehensive evaluation summary of their potential fit and cultural alignment.',
            },
            hireRecommendation: {
              type: Type.STRING,
              description: 'Must be one of: "Strong Hire", "Pass", "Neutral", "Do Not hire".',
            },
            answersBreakdown: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING },
                  assessment: { type: Type.STRING, description: 'Evaluation of this specific response.' },
                  score: { type: Type.INTEGER, description: 'Score for this specific response (0-10)' },
                },
                required: ['question', 'answer', 'assessment', 'score'],
              },
            },
          },
          required: [
            'competencyScore',
            'communicationScore',
            'strengths',
            'skillGaps',
            'qualitativeSummary',
            'hireRecommendation',
            'answersBreakdown',
          ],
        },
      },
    });

    const evaluationText = response.text;
    if (!evaluationText) {
      return res.status(500).json({ error: 'Empty audit from Gemini API' });
    }

    const parsedEvaluation = JSON.parse(evaluationText);
    return res.json({
      evaluation: parsedEvaluation,
      webcamStats,
    });
  } catch (error: any) {
    console.error('Error in /api/scoring/evaluate:', error);
    return res.status(500).json({
      error: error?.message || 'Failed to score interview',
    });
  }
});

/**
 * Route: Proxy Groq Chat Completions (points to api.groq.com)
 * Both /api/groq/chat and /api/openrouter/chat trigger this for maximum backward and forward stability.
 */
const groqChatHandler = async (req: Request, res: Response) => {
  try {
    const {
      model = 'llama-3.1-8b-instant',
      messages,
      temperature = 0.7,
      top_p = 0.9,
      max_tokens = 1000,
      userApiKey
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Prioritize client-provided API key from UI config, then server env variable
    const effectiveKey = userApiKey || process.env.GROQ_API_KEY || '';

    if (!effectiveKey) {
      return res.status(401).json({
        error: 'Groq Authentication Missing: Please provide a Groq API key in the panel or configure the GROQ_API_KEY secret in your settings.'
      });
    }

    const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${effectiveKey}`
    };

    // Normalize incoming OpenRouter models to corresponding stable Groq models
    let targetModel = model;
    const modelLower = model.toLowerCase();
    
    if (
      modelLower.includes('mistral') || 
      modelLower.includes('deepseek') || 
      modelLower.includes('mixtral')
    ) {
      targetModel = 'mixtral-8x7b-32768';
    } else if (
      modelLower.includes('llama-3-8b') ||
      modelLower.includes('llama-3.1-8b') ||
      modelLower.includes('llama-3.1') ||
      modelLower.includes('llama3-8b')
    ) {
      targetModel = 'llama-3.1-8b-instant';
    } else if (
      modelLower.includes('llama-3.3') ||
      modelLower.includes('llama-3.3-70b') ||
      modelLower.includes('llama3-70b')
    ) {
      targetModel = 'llama-3.3-70b-versatile';
    } else if (modelLower.includes('gemini') || modelLower.includes('gemma')) {
      targetModel = 'gemma2-9b-it';
    } else if (!modelLower.includes('-')) {
      // If it is a generic name or doesn't match Groq pattern, default to recommended mixtral-8x7b-32768
      targetModel = 'mixtral-8x7b-32768';
    }

    // Secondary and tertiary highly stable free fallback candidates on Groq
    const candidates = [
      targetModel,
      'mixtral-8x7b-32768',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'llama-3.3-70b-versatile'
    ];

    // Remove duplicates while preserving original sequence hierarchy
    const uniqueCandidates = Array.from(new Set(candidates));

    let lastError = 'No completed request to Groq';
    let lastStatus = 500;
    let success = false;
    let data: any = null;
    let finalModelUsed = model;

    // Helper sleep function to pace retries particularly on 429 rate limit triggers
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Outer candidate cascade loop
    for (const currentModel of uniqueCandidates) {
      // Inner retry loop per candidate model (up to 2 attempts with backoff on 429)
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const payload = {
            model: currentModel,
            messages,
            temperature,
            top_p,
            max_tokens: Math.min(max_tokens, 1200) // Keep token size moderate for free models on Groq
          };

          const response = await fetch(groqUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
          });

          if (response.ok) {
            data = await response.json();
            success = true;
            finalModelUsed = currentModel;
            break;
          }

          const errText = await response.text();
          let parsedErr;
          try {
            parsedErr = JSON.parse(errText);
          } catch (e) {
            parsedErr = { error: { message: errText } };
          }
          
          lastError = parsedErr?.error?.message || `Groq responded with status ${response.status}`;
          lastStatus = response.status;

          console.warn(`[Groq API Proxy] Model "${currentModel}" failed (Attempt ${attempt}/${maxRetries}): Error "${lastError}" (HTTP ${response.status})`);

          if (response.status === 429) {
            if (attempt < maxRetries) {
              const backoffMs = attempt * 1200;
              console.warn(`[Groq Retry Cooloff] Encountered status 429. Sleeping ${backoffMs}ms before retry attempt ${attempt + 1}...`);
              await sleep(backoffMs);
              continue; // Trigger retry attempt
            }
          }
          
          break;
        } catch (err: any) {
          lastError = err?.message || 'Network fetch timeout to Groq';
          lastStatus = 500;
          console.error(`[Groq Network Timeout/Error] Failed on model "${currentModel}" (Attempt ${attempt}):`, err);
          break;
        }
      }

      if (success) {
        break; // Break candidates cascade if completed successfully
      }
    }

    if (!success) {
      let helpfulTip = '';
      if (lastStatus === 429 || lastError.toLowerCase().includes('429') || lastError.toLowerCase().includes('rate limit')) {
        helpfulTip = ' \n\n⛔ **429: Groq Rate Limit Exceeded**: The Groq free tier is experiencing heavy traffic.\n\n🛠️ **Remedy**: Switch to a different model (like Gemma 2 or Llama 3.1 8B), or wait 10 seconds and resend your request.';
      }
      return res.status(lastStatus).json({ 
        error: `${lastError}${helpfulTip}`
      });
    }

    // Attach tracking variables to indicate self-healing status back in the client UI logs
    if (finalModelUsed !== model) {
      if (!data) data = {};
      data.fallbackUsed = true;
      data.fallbackModel = finalModelUsed;
    }

    return res.json(data);
  } catch (error: any) {
    console.error('Error in Groq chat proxy handler:', error);
    return res.status(500).json({
      error: error?.message || 'Failed connecting to Groq global nodes'
    });
  }
};

app.post('/api/groq/chat', groqChatHandler);
app.post('/api/openrouter/chat', groqChatHandler);

/**
 * Handle static files in production
 */
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve('dist');
  app.use(express.static(distPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`JobVibe AI Server listening on http://0.0.0.0:${PORT} in [${process.env.NODE_ENV || 'development'}] mode`);
});
