import React, { useState } from 'react';
import { Upload, RefreshCw, Send, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import * as mammoth from 'mammoth';

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

interface QuizData {
  questions: QuizQuestion[];
}

interface QuizResult {
  correct: boolean;
  userAnswer: number | undefined;
  correctAnswer: number;
}

type Step = 'setup' | 'upload' | 'quiz' | 'results';

export default function DOCXQuizApp() {
  const [apiKey, setApiKey] = useState<string>('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<Step>('setup');

  const extractTextFromDOCX = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromDOC = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer;
          const result = await mammoth.extractRawText({ arrayBuffer });
          resolve(result.value);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  };

  const generateQuiz = async (text: string): Promise<void> => {
    setLoading(true);
    try {
      const wordCount = text.split(/\s+/).length;
      const questionCount = Math.max(10, Math.min(20, Math.floor(wordCount / 100)));

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen/qwen3-32b',
          messages: [
            {
              role: 'system',
              content: 'Te egy precíz kvíz generátor asszisztens vagy. A felhasználó által megadott szövegből készíts kvízt JSON formátumban. KRITIKUS: A "correct" mező értéke MINDIG az options tömb indexe (0, 1, 2, vagy 3), amely a helyes választ tartalmazza.'
            },
            {
              role: 'user',
              content: `Készíts ${questionCount} darab feleletválasztós kérdést az alábbi szövegből. 

FONTOS SZABÁLYOK:
1. Minden kérdéshez adj 4 lehetséges választ
2. Pontosan 1 válasz helyes, a többi téves
3. A "correct" mező értéke a helyes válasz INDEXE (0, 1, 2, vagy 3) az options tömbben
4. A válaszokat keverd össze pozícióban
5. A helytelen válaszoknak hihető alternatíváknak kell lenniük
6. Ne használj "A)", "B)" stb. előtagokat a válaszokban

PÉLDA:
{
  "questions": [
    {
      "question": "Melyik évben történt X esemény?",
      "options": ["1990", "1995", "2000", "2005"],
      "correct": 2
    }
  ]
}

Ez a példában a "correct": 2 azt jelenti, hogy az options[2] azaz "2000" a helyes válasz.

VÁLASZD CSAK ÉS KIZÁRÓLAG JSON FORMÁTUMBAN, más szöveg nélkül!

Szöveg:
${text.substring(0, 10000)}`
            }
          ],
          temperature: 0.3,
          max_tokens: 6000
        })
      });

      if (!response.ok) {
        throw new Error('Hiba a kvíz generálása során');
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      let cleanedContent = content.trim();
      cleanedContent = cleanedContent.replace(/```json\s*/g, '');
      cleanedContent = cleanedContent.replace(/```\s*/g, '');
      cleanedContent = cleanedContent.trim();
      
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const quizData: QuizData = JSON.parse(jsonMatch[0]);
        
        if (!quizData.questions || !Array.isArray(quizData.questions)) {
          throw new Error('Érvénytelen kvíz formátum');
        }
        
        quizData.questions = quizData.questions.map((q, idx) => {
          if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
            console.error(`Érvénytelen kérdés ${idx}:`, q);
            return null;
          }
          
          if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3) {
            console.error(`Érvénytelen correct index a ${idx}. kérdésnél:`, q.correct);
            q.correct = 0;
          }
          
          return q;
        }).filter((q): q is QuizQuestion => q !== null);
        
        if (quizData.questions.length === 0) {
          throw new Error('Nem sikerült érvényes kérdéseket generálni');
        }
        
        setQuiz(quizData);
        setAnswers({});
        setResults(null);
        setStep('quiz');
      } else {
        throw new Error('Nem sikerült értelmezni a választ');
      }
    } catch (error) {
      alert('Hiba történt: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const validTypes = ['doc', 'docx'];
    
    if (!fileExtension || !validTypes.includes(fileExtension)) {
      alert('Kérlek, válassz egy DOC vagy DOCX fájlt!');
      return;
    }

    setUploadedFile(file);
    setLoading(true);
    
    try {
      let text = '';
      
      if (fileExtension === 'docx') {
        text = await extractTextFromDOCX(file);
      } else if (fileExtension === 'doc') {
        text = await extractTextFromDOC(file);
      }
      
      setExtractedText(text);
      await generateQuiz(text);
    } catch (error) {
      alert('Hiba a fájl feldolgozása során: ' + (error as Error).message);
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionIndex: number, optionIndex: number): void => {
    setAnswers({
      ...answers,
      [questionIndex]: optionIndex
    });
  };

  const checkAnswers = (): void => {
    if (!quiz) return;
    
    const newResults: QuizResult[] = quiz.questions.map((q, idx) => ({
      correct: answers[idx] === q.correct,
      userAnswer: answers[idx],
      correctAnswer: q.correct
    }));
    setResults(newResults);
    setStep('results');
  };

  const resetQuiz = async (): Promise<void> => {
    if (!extractedText) return;
    
    setAnswers({});
    setResults(null);
    setQuiz(null);
    setLoading(true);
    
    try {
      await generateQuiz(extractedText);
    } catch (error) {
      alert('Hiba az újra generálás során: ' + (error as Error).message);
      setLoading(false);
    }
  };

  const startOver = (): void => {
    setApiKey('');
    setUploadedFile(null);
    setExtractedText('');
    setQuiz(null);
    setAnswers({});
    setResults(null);
    setStep('setup');
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-black flex items-center justify-center p-4">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full border border-purple-500/30">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-purple-500/20 rounded-full mb-4">
              <FileText className="w-16 h-16 text-purple-400" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
              Quiz Generátor
            </h1>
            <p className="text-gray-400">Groq AI-val működik</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Groq API Kulcs
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-4 py-3 bg-slate-700/50 border border-purple-500/30 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition text-white placeholder-gray-500"
              />
              <p className="mt-2 text-xs text-gray-500">
                Szerezz API kulcsot: <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 hover:underline transition">console.groq.com</a>
              </p>
            </div>
            
            <button
              onClick={() => setStep('upload')}
              disabled={!apiKey}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition shadow-lg shadow-purple-500/20"
            >
              Tovább
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'upload' && !quiz) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-black flex items-center justify-center p-4">
        <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 max-w-md w-full border border-purple-500/30">
          <div className="text-center mb-8">
            <div className="inline-block p-4 bg-purple-500/20 rounded-full mb-4">
              <Upload className="w-16 h-16 text-purple-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Dokumentum Feltöltés</h2>
            <p className="text-gray-400">Tölts fel egy 3-4 oldalas dokumentumot</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Kvíz generálása...</p>
            </div>
          ) : (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-purple-500/30 rounded-lg cursor-pointer hover:border-purple-500 hover:bg-slate-700/30 transition group">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 text-gray-500 group-hover:text-purple-400 mb-3 transition" />
                  <p className="text-sm text-gray-300 font-medium">Kattints a fájl feltöltéséhez</p>
                  <p className="text-xs text-gray-500 mt-1">DOC vagy DOCX, max 4 oldal</p>
                </div>
                <input
                  type="file"
                  accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              
              <button
                onClick={startOver}
                className="w-full mt-4 text-gray-400 py-2 hover:text-purple-400 transition"
              >
                Vissza
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'quiz' && quiz) {
    const allAnswered = Object.keys(answers).length === quiz.questions.length;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-black p-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-purple-500/30">
            <div className="mb-8">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">Kvíz</h2>
              <p className="text-gray-400">Válaszolj az alábbi kérdésekre</p>
              <div className="mt-4 bg-purple-900/30 rounded-lg p-3 border border-purple-500/30">
                <p className="text-sm text-purple-300">
                  Megválaszolt: {Object.keys(answers).length} / {quiz.questions.length}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIdx) => (
                <div key={qIdx} className="bg-slate-700/30 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
                  <h3 className="text-lg font-semibold text-white mb-4">
                    {qIdx + 1}. {q.question}
                  </h3>
                  <div className="space-y-3">
                    {q.options.map((option, oIdx) => (
                      <label
                        key={oIdx}
                        className={`flex items-center p-4 rounded-lg cursor-pointer transition ${
                          answers[qIdx] === oIdx
                            ? 'bg-purple-600/30 border-2 border-purple-500 shadow-lg shadow-purple-500/20'
                            : 'bg-slate-800/50 border-2 border-slate-600/50 hover:border-purple-500/50 hover:bg-slate-700/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${qIdx}`}
                          checked={answers[qIdx] === oIdx}
                          onChange={() => handleAnswerChange(qIdx, oIdx)}
                          className="mr-3 w-5 h-5 text-purple-600"
                        />
                        <span className="text-gray-200">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={checkAnswers}
                disabled={!allAnswered}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <Send className="w-5 h-5" />
                Küldés
              </button>
              <button
                onClick={resetQuiz}
                disabled={loading}
                className="bg-slate-700/50 text-gray-300 px-6 py-4 rounded-lg font-semibold hover:bg-slate-600/50 disabled:bg-slate-800/50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 border border-purple-500/20"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Új kvíz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'results' && quiz && results) {
    const score = results.filter(r => r.correct).length;
    const totalQuestions = results.length;
    const percentage = Math.round((score / totalQuestions) * 100);

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-slate-900 to-black p-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-purple-500/30">
            <div className="text-center mb-8">
              <div className={`w-28 h-28 mx-auto mb-4 rounded-full flex items-center justify-center backdrop-blur-sm ${
                percentage >= 70 ? 'bg-green-500/20 border-2 border-green-500 shadow-lg shadow-green-500/30' : 'bg-red-500/20 border-2 border-red-500 shadow-lg shadow-red-500/30'
              }`}>
                <span className={`text-5xl font-bold ${
                  percentage >= 70 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {percentage}%
                </span>
              </div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">Eredmények</h2>
              <p className="text-gray-400 text-lg">
                {score} helyes válasz {totalQuestions}-ból
              </p>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIdx) => (
                <div key={qIdx} className={`rounded-xl p-6 border-2 backdrop-blur-sm ${
                  results[qIdx].correct ? 'bg-green-500/10 border-green-500/50' : 'bg-red-500/10 border-red-500/50'
                }`}>
                  <div className="flex items-start gap-3 mb-4">
                    {results[qIdx].correct ? (
                      <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {qIdx + 1}. {q.question}
                      </h3>
                      <div className="space-y-2">
                        {q.options.map((option, oIdx) => (
                          <div
                            key={oIdx}
                            className={`p-3 rounded-lg ${
                              oIdx === q.correct
                                ? 'bg-green-500/20 border-2 border-green-500/50'
                                : oIdx === results[qIdx].userAnswer && !results[qIdx].correct
                                ? 'bg-red-500/20 border-2 border-red-500/50'
                                : 'bg-slate-700/30 border border-slate-600/50'
                            }`}
                          >
                            <span className="text-gray-200">{option}</span>
                            {oIdx === q.correct && (
                              <span className="ml-2 text-green-400 font-semibold">✓ Helyes</span>
                            )}
                            {oIdx === results[qIdx].userAnswer && !results[qIdx].correct && (
                              <span className="ml-2 text-red-400 font-semibold">✗ Te ezt választottad</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex gap-4">
              <button
                onClick={resetQuiz}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white py-4 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Új kvíz generálása
              </button>
              <button
                onClick={startOver}
                className="bg-slate-700/50 text-gray-300 px-6 py-4 rounded-lg font-semibold hover:bg-slate-600/50 transition border border-purple-500/20"
              >
                Új dokumentum
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}