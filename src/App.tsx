// @ts-nocheck
import React, { useState } from 'react';
import { Upload, RefreshCw, Send, FileText, Loader2, CheckCircle, XCircle } from 'lucide-react';
import * as mammoth from 'mammoth';

export default function DOCXQuizApp() {
  const [apiKey, setApiKey] = useState('');
  const [docxFile, setDocxFile] = useState(null);
  const [docxText, setDocxText] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('setup'); // setup, upload, quiz, results

  const extractTextFromDOCX = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
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

  const generateQuiz = async (text) => {
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
      
      // Tisztítsuk meg a választ, távolítsuk el a markdown kód blokkokat
      let cleanedContent = content.trim();
      cleanedContent = cleanedContent.replace(/```json\s*/g, '');
      cleanedContent = cleanedContent.replace(/```\s*/g, '');
      cleanedContent = cleanedContent.trim();
      
      const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const quizData = JSON.parse(jsonMatch[0]);
        
        // Validáljuk a kvíz adatokat
        if (!quizData.questions || !Array.isArray(quizData.questions)) {
          throw new Error('Érvénytelen kvíz formátum');
        }
        
        // Ellenőrizzük és javítsuk ki az egyes kérdéseket
        quizData.questions = quizData.questions.map((q, idx) => {
          if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length !== 4) {
            console.error(`Érvénytelen kérdés ${idx}:`, q);
            return null;
          }
          
          // Ellenőrizzük hogy a correct index érvényes-e
          if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 3) {
            console.error(`Érvénytelen correct index a ${idx}. kérdésnél:`, q.correct);
            q.correct = 0; // Alapértelmezett első válasz
          }
          
          return q;
        }).filter(q => q !== null);
        
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
      alert('Hiba történt: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file && (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx'))) {
      setDocxFile(file);
      setLoading(true);
      try {
        const text = await extractTextFromDOCX(file);
        setDocxText(text);
        await generateQuiz(text);
      } catch (error) {
        alert('Hiba a DOCX feldolgozása során: ' + error.message);
        setLoading(false);
      }
    } else {
      alert('Kérlek, válassz egy DOCX fájlt!');
    }
  };

  const handleAnswerChange = (questionIndex, optionIndex) => {
    setAnswers({
      ...answers,
      [questionIndex]: optionIndex
    });
  };

  const checkAnswers = () => {
    const newResults = quiz.questions.map((q, idx) => ({
      correct: answers[idx] === q.correct,
      userAnswer: answers[idx],
      correctAnswer: q.correct
    }));
    setResults(newResults);
    setStep('results');
  };

  const resetQuiz = async () => {
    setAnswers({});
    setResults(null);
    setStep('quiz');
    await generateQuiz(docxText);
  };

  const startOver = () => {
    setApiKey('');
    setDocxFile(null);
    setDocxText('');
    setQuiz(null);
    setAnswers({});
    setResults(null);
    setStep('setup');
  };

  if (step === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <FileText className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-800 mb-2">DOCX Kvíz Generátor</h1>
            <p className="text-gray-600">Groq AI-val működik</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Groq API Kulcs
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="gsk_..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
              />
              <p className="mt-2 text-xs text-gray-500">
                Szerezz API kulcsot: <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">console.groq.com</a>
              </p>
            </div>
            
            <button
              onClick={() => setStep('upload')}
              disabled={!apiKey}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <Upload className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">DOCX Feltöltés</h2>
            <p className="text-gray-600">Tölts fel egy 3-4 oldalas Word dokumentumot</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Kvíz generálása...</p>
            </div>
          ) : (
            <div>
              <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 text-gray-400 mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Kattints a DOCX feltöltéséhez</p>
                  <p className="text-xs text-gray-500 mt-1">Word dokumentum (.docx), max 4 oldal</p>
                </div>
                <input
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
              
              <button
                onClick={startOver}
                className="w-full mt-4 text-gray-600 py-2 hover:text-indigo-600 transition"
              >
                Vissza
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'quiz') {
    const allAnswered = quiz && Object.keys(answers).length === quiz.questions.length;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Kvíz</h2>
              <p className="text-gray-600">Válaszolj az alábbi kérdésekre</p>
              <div className="mt-4 bg-indigo-50 rounded-lg p-3">
                <p className="text-sm text-indigo-800">
                  Megválaszolt: {Object.keys(answers).length} / {quiz.questions.length}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIdx) => (
                <div key={qIdx} className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">
                    {qIdx + 1}. {q.question}
                  </h3>
                  <div className="space-y-3">
                    {q.options.map((option, oIdx) => (
                      <label
                        key={oIdx}
                        className={`flex items-center p-4 rounded-lg cursor-pointer transition ${
                          answers[qIdx] === oIdx
                            ? 'bg-indigo-100 border-2 border-indigo-500'
                            : 'bg-white border-2 border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${qIdx}`}
                          checked={answers[qIdx] === oIdx}
                          onChange={() => handleAnswerChange(qIdx, oIdx)}
                          className="mr-3 w-5 h-5 text-indigo-600"
                        />
                        <span className="text-gray-700">{option}</span>
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
                className="flex-1 bg-indigo-600 text-white py-4 rounded-lg font-semibold hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                Küldés
              </button>
              <button
                onClick={resetQuiz}
                disabled={loading}
                className="bg-gray-200 text-gray-700 px-6 py-4 rounded-lg font-semibold hover:bg-gray-300 transition flex items-center justify-center gap-2"
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

  if (step === 'results') {
    const score = results ? results.filter(r => r.correct).length : 0;
    const totalQuestions = results ? results.length : 0;
    const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="text-center mb-8">
              <div className={`w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center ${
                percentage >= 70 ? 'bg-green-100' : 'bg-red-100'
              }`}>
                <span className={`text-4xl font-bold ${
                  percentage >= 70 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {percentage}%
                </span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Eredmények</h2>
              <p className="text-gray-600">
                {score} helyes válasz {totalQuestions}-ból
              </p>
            </div>

            <div className="space-y-6">
              {quiz.questions.map((q, qIdx) => (
                <div key={qIdx} className={`rounded-xl p-6 ${
                  results[qIdx].correct ? 'bg-green-50 border-2 border-green-200' : 'bg-red-50 border-2 border-red-200'
                }`}>
                  <div className="flex items-start gap-3 mb-4">
                    {results[qIdx].correct ? (
                      <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        {qIdx + 1}. {q.question}
                      </h3>
                      <div className="space-y-2">
                        {q.options.map((option, oIdx) => (
                          <div
                            key={oIdx}
                            className={`p-3 rounded-lg ${
                              oIdx === q.correct
                                ? 'bg-green-100 border-2 border-green-300'
                                : oIdx === results[qIdx].userAnswer && !results[qIdx].correct
                                ? 'bg-red-100 border-2 border-red-300'
                                : 'bg-white border border-gray-200'
                            }`}
                          >
                            <span className="text-gray-700">{option}</span>
                            {oIdx === q.correct && (
                              <span className="ml-2 text-green-600 font-semibold">✓ Helyes</span>
                            )}
                            {oIdx === results[qIdx].userAnswer && !results[qIdx].correct && (
                              <span className="ml-2 text-red-600 font-semibold">✗ Te ezt választottad</span>
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
                className="flex-1 bg-indigo-600 text-white py-4 rounded-lg font-semibold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                Új kvíz generálása
              </button>
              <button
                onClick={startOver}
                className="bg-gray-200 text-gray-700 px-6 py-4 rounded-lg font-semibold hover:bg-gray-300 transition"
              >
                Új DOCX
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}