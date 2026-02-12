const express = require('express');
const router = express.Router();
const multer = require('multer');
const Study = require('../models/Study');
const { authMiddleware } = require('../middleware/auth');
const { formatStudyDocument, generateQuizQuestions, chatAboutQuestion, streamChatMessage, getQuestionRecommendation, analyzeQuizResults, generateVideoScript } = require('../utils/pollinations');
const officeParser = require('officeparser');

// Helper function to parse PDF using pdfjs-dist
async function parsePdf(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  
  const uint8Array = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return { text: fullText };
}

// Helper function to parse presentations and other office files using officeparser
async function parseOfficeFile(buffer, filename) {
  try {
    const text = await officeParser.parseOfficeAsync(buffer, {
      outputErrorToConsole: false,
      tempFilesLocation: '/tmp/',
      ignoreNotes: false // Include speaker notes from presentations
    });
    return { text: text || '' };
  } catch (error) {
    console.error(`Error parsing office file ${filename}:`, error);
    throw new Error(`Failed to parse ${filename}`);
  }
}

// Helper function to determine file type and parse accordingly
async function parseFile(buffer, filename, mimetype) {
  if (mimetype === 'application/pdf') {
    return await parsePdf(buffer);
  } else {
    // Handle presentations and other office files
    return await parseOfficeFile(buffer, filename);
  }
}

// Multer setup for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit per file
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.ms-powerpoint', // .ppt
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/vnd.oasis.opendocument.presentation', // .odp
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.oasis.opendocument.text', // .odt
      'application/vnd.oasis.opendocument.spreadsheet' // .ods
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, PowerPoint, Word, Excel, and OpenDocument files are allowed'), false);
    }
  },
});

// Get all studies for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const studies = await Study.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ studies });
  } catch (error) {
    console.error('Get studies error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single study
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }
    
    // Add question recommendation based on content length and topic count
    const topicCount = study.topics?.length || 1;
    const recommendation = getQuestionRecommendation(study.content, topicCount);
    
    res.json({ study, questionRecommendation: recommendation });
  } catch (error) {
    console.error('Get study error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Generate quiz for a study
router.post('/:id/quiz', authMiddleware, async (req, res) => {
  try {
    const { numQuestions = 10, selectedTopics = [], previousResults = null, knownConcepts = null } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    console.log(`Generating ${numQuestions} quiz questions...`);
    console.log(`Selected topics: ${selectedTopics.length > 0 ? selectedTopics.join(', ') : 'All'}`);
    if (previousResults) {
      console.log(`Focus on mistakes mode: ${previousResults.wrong} wrong out of ${previousResults.total}`);
    }
    if (knownConcepts) {
      console.log(`Avoiding ${knownConcepts.length} known concepts`);
    }
    
    const questions = await generateQuizQuestions(
      study.content, 
      numQuestions, 
      selectedTopics, 
      study.topics || [],
      previousResults,
      knownConcepts
    );
    
    // Save quiz to study using findByIdAndUpdate to avoid version conflicts
    await Study.findByIdAndUpdate(
      req.params.id,
      { $set: { quizQuestions: questions } }
    );

    res.json({ questions });
  } catch (error) {
    console.error('Generate quiz error:', error);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

// Analyze quiz results
router.post('/:id/analyze-quiz', authMiddleware, async (req, res) => {
  try {
    const { results } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    if (!results || !Array.isArray(results)) {
      return res.status(400).json({ error: 'Results are required' });
    }

    console.log('Analyzing quiz results...');
    const analysis = await analyzeQuizResults(results, study.content, study.topics || []);

    res.json({ analysis });
  } catch (error) {
    console.error('Analyze quiz error:', error);
    res.status(500).json({ error: 'Failed to analyze quiz' });
  }
});

// Chat about a question - with tab context and persistent history
router.post('/:id/chat', authMiddleware, async (req, res) => {
  try {
    const { message, activeTab, currentQuizQuestion } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Determine which chat history to use based on active tab
    const isQuizTab = activeTab === 'quiz';
    const chatHistory = isQuizTab ? study.quizChatHistory : study.documentChatHistory;

    // Build context based on tab
    let context = '';
    if (isQuizTab && currentQuizQuestion) {
      const { question, options, hasAnswered, selectedOption, isCorrect, correctAnswer } = currentQuizQuestion;
      
      context = `The user is on the Quiz tab, working on this question:
"${question}"
Options: ${options.join(', ')}

`;
      if (hasAnswered) {
        context += `The user has already answered this question.
They selected: "${selectedOption}"
Their answer was: ${isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗'}
${!isCorrect ? `The correct answer was: "${correctAnswer}"` : ''}

Since they've already answered, you can freely discuss the answer and explain why it's correct or why their choice was wrong.`;
      } else if (selectedOption) {
        context += `The user has selected "${selectedOption}" but hasn't submitted yet.
Do NOT reveal if this is correct or wrong. Help them think through their choice without giving away the answer.`;
      } else {
        context += `The user hasn't selected an answer yet.
Help them understand the question and think through the options WITHOUT revealing the correct answer.`;
      }
    } else {
      context = `The user is on the Document tab, reading the study material. Help them understand the content.`;
    }

    console.log(`Chatting (${activeTab} tab)...`);
    console.log('Context:', context);
    const response = await chatAboutQuestion(context, message, study.content, chatHistory);

    // Save both user message and assistant response to the appropriate chat history
    const userMsg = { role: 'user', content: message, timestamp: new Date() };
    const assistantMsg = { role: 'assistant', content: response, timestamp: new Date() };

    if (isQuizTab) {
      study.quizChatHistory.push(userMsg, assistantMsg);
    } else {
      study.documentChatHistory.push(userMsg, assistantMsg);
    }
    await study.save();

    res.json({ response });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to get response' });
  }
});

// Streaming chat endpoint using Server-Sent Events
router.post('/:id/chat/stream', authMiddleware, async (req, res) => {
  try {
    const { message, activeTab, currentQuizQuestion } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Determine which chat history to use based on active tab
    const isQuizTab = activeTab === 'quiz';
    const chatHistory = isQuizTab ? study.quizChatHistory : study.documentChatHistory;

    // Build context based on tab
    let context = '';
    if (isQuizTab && currentQuizQuestion) {
      const { question, options, hasAnswered, selectedOption, isCorrect, correctAnswer } = currentQuizQuestion;
      
      context = `The user is on the Quiz tab, working on this question:
"${question}"
Options: ${options.join(', ')}

`;
      if (hasAnswered) {
        context += `The user has already answered this question.
They selected: "${selectedOption}"
Their answer was: ${isCorrect ? 'CORRECT ✓' : 'INCORRECT ✗'}
${!isCorrect ? `The correct answer was: "${correctAnswer}"` : ''}

Since they've already answered, you can freely discuss the answer and explain why it's correct or why their choice was wrong.`;
      } else if (selectedOption) {
        context += `The user has selected "${selectedOption}" but hasn't submitted yet.
Do NOT reveal if this is correct or wrong. Help them think through their choice without giving away the answer.`;
      } else {
        context += `The user hasn't selected an answer yet.
Help them understand the question and think through the options WITHOUT revealing the correct answer.`;
      }
    } else {
      context = `The user is on the Document tab, reading the study material. Help them understand the content.`;
    }

    console.log(`Streaming chat (${activeTab} tab)...`);
    
    // Stream the response
    const fullResponse = await streamChatMessage(context, message, study.content, chatHistory, res);

    // Save both user message and assistant response to the appropriate chat history
    const userMsg = { role: 'user', content: message, timestamp: new Date() };
    const assistantMsg = { role: 'assistant', content: fullResponse, timestamp: new Date() };

    if (isQuizTab) {
      study.quizChatHistory.push(userMsg, assistantMsg);
    } else {
      study.documentChatHistory.push(userMsg, assistantMsg);
    }
    await study.save();

  } catch (error) {
    console.error('Stream chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to get response' });
    } else {
      res.write(`data: ${JSON.stringify({ error: 'Failed to get response' })}\n\n`);
      res.end();
    }
  }
});

// Get chat history for a specific tab
router.get('/:id/chat/:tab', authMiddleware, async (req, res) => {
  try {
    const { tab } = req.params;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const chatHistory = tab === 'quiz' ? study.quizChatHistory : study.documentChatHistory;
    res.json({ messages: chatHistory });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear chat history for a specific tab
router.delete('/:id/chat/:tab', authMiddleware, async (req, res) => {
  try {
    const { tab } = req.params;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    if (tab === 'quiz') {
      study.quizChatHistory = [];
    } else {
      study.documentChatHistory = [];
    }
    await study.save();

    res.json({ message: 'Chat history cleared' });
  } catch (error) {
    console.error('Clear chat history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create study from notes
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // Format the content using AI with topics
    console.log('Formatting study document with AI...');
    let formattedResult;
    try {
      formattedResult = await formatStudyDocument(content, title, description, []);
    } catch (formatError) {
      console.error('AI formatting failed, using raw content:', formatError);
      formattedResult = {
        topics: [{ id: 'topic-1', title, icon: '📚', content, order: 0 }],
        fullContent: content
      };
    }

    const study = await Study.create({
      userId: req.user._id,
      title,
      description,
      content: formattedResult.fullContent,
      topics: formattedResult.topics,
      rawContent: content,
      sourceType: 'notes',
    });

    res.status(201).json({ study });
  } catch (error) {
    console.error('Create study error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create study from PDF uploads
router.post('/upload', authMiddleware, upload.array('pdfs', 20), async (req, res) => {
  try {
    const { title, description } = req.body;
    const files = req.files;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Extract text from all files
    const extractedTexts = [];
    const fileNames = [];

    for (const file of files) {
      try {
        const data = await parseFile(file.buffer, file.originalname, file.mimetype);
        extractedTexts.push(`--- ${file.originalname} ---\n${data.text}`);
        fileNames.push(file.originalname);
      } catch (parseError) {
        console.error(`Error parsing file ${file.originalname}:`, parseError);
        return res.status(400).json({ error: `Failed to parse file "${file.originalname}"` });
      }
    }

    const rawContent = extractedTexts.join('\n\n');

    // Format the content using AI with topics
    console.log('Formatting study document with AI...');
    let formattedResult;
    try {
      formattedResult = await formatStudyDocument(rawContent, title, description, fileNames);
    } catch (formatError) {
      console.error('AI formatting failed, using raw content:', formatError);
      formattedResult = {
        topics: [{ id: 'topic-1', title, icon: '📚', content: rawContent, order: 0 }],
        fullContent: rawContent
      };
    }

    const study = await Study.create({
      userId: req.user._id,
      title,
      description,
      content: formattedResult.fullContent,
      topics: formattedResult.topics,
      rawContent: rawContent,
      sourceType: 'document',
      uploadedFileNames: fileNames,
    });

    res.status(201).json({ study });
  } catch (error) {
    console.error('Upload study error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete study
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const study = await Study.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }
    res.json({ message: 'Study deleted successfully' });
  } catch (error) {
    console.error('Delete study error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save quiz result to history
router.post('/:id/quiz-history', authMiddleware, async (req, res) => {
  try {
    const { answers, selectedTopics } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Answers are required' });
    }

    const correctCount = answers.filter(a => a.isCorrect).length;
    const wrongCount = answers.length - correctCount;
    const percentage = Math.round((correctCount / answers.length) * 100);

    const historyEntry = {
      id: `quiz-${Date.now()}`,
      takenAt: new Date(),
      totalQuestions: answers.length,
      correctCount,
      wrongCount,
      percentage,
      selectedTopics: selectedTopics || [],
      answers,
    };

    study.quizHistory.unshift(historyEntry); // Add to beginning (most recent first)
    
    // Keep only last 50 quiz attempts to prevent bloat
    if (study.quizHistory.length > 50) {
      study.quizHistory = study.quizHistory.slice(0, 50);
    }
    
    await study.save();

    res.json({ historyEntry });
  } catch (error) {
    console.error('Save quiz history error:', error);
    res.status(500).json({ error: 'Failed to save quiz history' });
  }
});

// Get quiz history
router.get('/:id/quiz-history', authMiddleware, async (req, res) => {
  try {
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    res.json({ history: study.quizHistory || [] });
  } catch (error) {
    console.error('Get quiz history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a specific quiz history entry
router.delete('/:id/quiz-history/:historyId', authMiddleware, async (req, res) => {
  try {
    const { historyId } = req.params;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    study.quizHistory = study.quizHistory.filter(h => h.id !== historyId);
    await study.save();

    res.json({ message: 'Quiz history entry deleted' });
  } catch (error) {
    console.error('Delete quiz history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all quiz history
router.delete('/:id/quiz-history', authMiddleware, async (req, res) => {
  try {
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    study.quizHistory = [];
    await study.save();

    res.json({ message: 'Quiz history cleared' });
  } catch (error) {
    console.error('Clear quiz history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update topic learned status
router.patch('/:id/topics/:topicId/learned', authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { learned } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const topic = study.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    topic.learned = learned;
    await study.save();

    res.json({ topic });
  } catch (error) {
    console.error('Update topic learned status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update topics learned status
router.patch('/:id/topics/learned', authMiddleware, async (req, res) => {
  try {
    const { topicIds, learned } = req.body;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    study.topics.forEach(topic => {
      if (topicIds.includes(topic.id)) {
        topic.learned = learned;
      }
    });
    await study.save();

    res.json({ topics: study.topics });
  } catch (error) {
    console.error('Bulk update topics learned status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get topic script for video generation (AI converts content to TikTok style)
router.get('/:id/topics/:topicId/script', authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.params;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const topic = study.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    // Generate TikTok-style script from topic content
    console.log(`Generating TikTok script for: ${topic.title}`);
    const script = await generateVideoScript(topic.title, topic.content);
    console.log(`Script generated (${script.length} chars)`);

    res.json({ script, title: topic.title });
  } catch (error) {
    console.error('Generate script error:', error);
    res.status(500).json({ error: 'Failed to generate script' });
  }
});

// Save video URL for a topic (called by frontend after WebSocket completes)
router.patch('/:id/topics/:topicId/video', authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.params;
    const { videoUrl } = req.body;
    
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const topic = study.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    topic.videoUrl = videoUrl;
    topic.videoGenerating = false;
    await study.save();

    res.json({ topic });
  } catch (error) {
    console.error('Save video URL error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete video for a topic
router.delete('/:id/topics/:topicId/video', authMiddleware, async (req, res) => {
  try {
    const { topicId } = req.params;
    const study = await Study.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!study) {
      return res.status(404).json({ error: 'Study not found' });
    }

    const topic = study.topics.find(t => t.id === topicId);
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found' });
    }

    topic.videoUrl = null;
    await study.save();

    res.json({ message: 'Video deleted', topic });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
