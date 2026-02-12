/* 
Pollinations AI used to be free at time of writing this code. Now it is not.

Reference https://enter.pollinations.ai/ and https://enter.pollinations.ai/api/docs to update 
with your own API key.
*/


const axios = require('axios');

/**
 * Send messages to Pollinations AI API
 * @param {Array} messages - Array of message objects with role and content
 * @param {number} retryCount - Number of retries on failure
 * @returns {Promise<string>} - The AI response text
 */
async function sendPollinationsMessages(messages, retryCount = 3) {
    const apiEndpoint = 'https://text.pollinations.ai/openai';
    
    let attempts = 0;
    
    while (attempts < retryCount) {
        try {
            attempts++;
            console.log(`Generating text with Pollinations AI, attempt ${attempts}/${retryCount}...`);
            
            const response = await axios.post(
                apiEndpoint,
                {
                    messages: messages,
                    model: 'openai',
                    stream: false
                },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 300000 // 5 minutes
                }
            );
            
            console.log('Text generation completed successfully!');
            
            // Handle OpenAI-compatible response format
            if (response.data && response.data.choices && response.data.choices.length > 0) {
                let content = response.data.choices[0].message?.content;
                if (content) {
                    // Clean up any special tokens
                    content = content
                        .replace(/<\|.*?\|>[a-zA-Z0-9_]*?(?=<\||$)/g, '')
                        .replace(/<\|.*?\|>/g, '')
                        .trim();
                    return content;
                }
            }
            
            throw new Error(`No content found in response. Response structure: ${JSON.stringify(response.data)}`);
            
        } catch (error) {
            console.error(`Attempt ${attempts}/${retryCount} failed:`, error.message);
            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response data:", JSON.stringify(error.response.data, null, 2));
            }
            
            if (attempts === retryCount) {
                throw new Error(`Failed to generate text after ${retryCount} attempts: ${error.message}`);
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Format raw content into topics with beautiful formatting
 * @param {string} rawContent - Raw text from PDFs or notes
 * @param {string} title - Study title
 * @param {string} studyFor - What the user is studying for
 * @param {Array} pdfFileNames - Names of uploaded PDFs for context
 * @returns {Promise<Object>} - { topics: Array, fullContent: string }
 */
async function formatStudyDocument(rawContent, title, studyFor = '', pdfFileNames = []) {
    const studyContext = studyFor ? `The student is studying for: ${studyFor}` : '';
    const fileContext = pdfFileNames.length > 0 
        ? `Source files: ${pdfFileNames.join(', ')}. Each PDF should become its own unit/topic.`
        : '';
    
    const messages = [
        {
            role: 'system',
            content: `You are creating a comprehensive study guide. Output ONLY Markdown.

CRITICAL: Each TOPIC (usually each pdf is seperate topic but look context) MUST become a separate unit with header format:
# Unit 1: [Topic Name]
# Unit 2: [Topic Name]
etc.

Use ## for sections, ### for subsections within each unit.

FORMULA FORMAT:
## Expected Value Formula
\`\`\`
EV = (p₁ × V₁) + (p₂ × V₂) + ... + (pₙ × Vₙ) - fixed cost
\`\`\`
| Component | Meaning |
|-----------|---------|
| p | Probability (sum to 100%) |
| V | Dollar value |

**Example:** $1000 cost, 80% chance $1500, 20% chance $2000
EV = (0.80 × $1500) + (0.20 × $2000) - $1000 = $600

ARGUMENT FORMAT:
## Modus Ponens
\`\`\`
If A, then B
A
∴ B
\`\`\`

TABLES for fallacies/biases:
| Name | Definition | Example | Why Wrong |
|------|------------|---------|-----------|

Include ALL content. No JSON. Complete everything.`
        },
        {
            role: 'user',
            content: `Create study guide. IMPORTANT: Use "# Unit 1:", "# Unit 2:" etc for each PDF.

${studyContext}
${fileContext}

Title: ${title}

Each TOPIC = one "# Unit X: [Name]" section.
Include all formulas, fallacies, biases, argument types with tables and examples. Do not make formulas if it is not actual formula mentioned in the notes.

Content:
${rawContent}`
        }
    ];

    let response = await sendPollinationsMessages(messages);
    
    // Clean up any "should I continue" type messages that slip through
    response = response
        .replace(/please let me (know|continue|proceed).*$/gi, '')
        .replace(/should I (continue|proceed|go on).*$/gi, '')
        .replace(/let me know if you (want|need|would like).*$/gi, '')
        .replace(/I can continue.*$/gi, '')
        .replace(/want me to (continue|proceed|go on).*$/gi, '')
        .trim();
    
    // Parse markdown response into topics
    // Look for "# Unit X:" headers to split into topics
    const topicRegex = /^#\s+(Unit\s+\d+[:\s]+[^\n]+)/gmi;
    let matches = [...response.matchAll(topicRegex)];
    let isUnitFormat = matches.length >= 2;
    
    // Fallback: if no "# Unit" headers found, try any # header
    if (matches.length < 2) {
        const fallbackRegex = /^#\s+([^\n]+)/gm;
        matches = [...response.matchAll(fallbackRegex)];
        isUnitFormat = false;
    }
    
    if (matches.length >= 2) {
        // Multiple topics found - split content
        const topics = [];
        
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const nextMatch = matches[i + 1];
            
            const startIndex = match.index;
            const endIndex = nextMatch ? nextMatch.index : response.length;
            
            const topicContent = response.substring(startIndex, endIndex).trim();
            let titleLine = match[1].trim();
            
            // Extract emoji from title if present
            const emojiMatch = titleLine.match(/^([\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|📚|💡|⚠️|✅|🔑|📝|🎯|📊|📌|👥)\s*/u);
            const icon = emojiMatch ? emojiMatch[1] : '📚';
            let title = emojiMatch ? titleLine.substring(emojiMatch[0].length).trim() : titleLine;
            
            // Keep "Unit X:" prefix in the title for clarity
            // titleLine already includes "Unit X:" from the regex capture group
            
            topics.push({
                id: `topic-${i + 1}`,
                title: title,
                icon: icon,
                content: topicContent.replace(/^#\s+[^\n]+\n*/, '').trim(), // Remove the # header from content
                order: i
            });
        }
        
        return {
            topics,
            fullContent: response
        };
    }
    
    // Single topic or no clear topic divisions - return as single topic
    return {
        topics: [{
            id: 'topic-1',
            title: title,
            icon: '📚',
            content: response,
            order: 0
        }],
        fullContent: response
    };
}

/**
 * Generate quiz questions from study content
 * @param {string} content - Study content
 * @param {number} numQuestions - Number of questions to generate
 * @param {Array} selectedTopics - Optional array of topic IDs to focus on
 * @param {Array} allTopics - All topics for context
 * @param {Object} previousResults - Previous quiz results for "focus on mistakes" mode
 * @param {Array} knownConcepts - Questions the user has already mastered (to avoid)
 * @returns {Promise<Array>} - Array of quiz questions
 */
async function generateQuizQuestions(content, numQuestions = 10, selectedTopics = [], allTopics = [], previousResults = null, knownConcepts = null) {
    // If specific topics selected, filter content
    let quizContent = content;
    let topicContext = '';
    
    if (selectedTopics.length > 0 && allTopics.length > 0) {
        const filteredTopics = allTopics.filter(t => selectedTopics.includes(t.id));
        if (filteredTopics.length > 0) {
            quizContent = filteredTopics.map(t => `## ${t.title}\n${t.content}`).join('\n\n');
            topicContext = `Focus questions on these topics: ${filteredTopics.map(t => t.title).join(', ')}`;
        }
    }
    
    // Build previous results context if available
    let previousResultsContext = '';
    if (previousResults && previousResults.wrongQuestions && previousResults.wrongQuestions.length > 0) {
        previousResultsContext = `
IMPORTANT - FOCUS ON WEAK AREAS:
The student just completed a quiz and got ${previousResults.correct} correct and ${previousResults.wrong} wrong out of ${previousResults.total} questions.

Here are the questions they got WRONG - generate NEW questions that test the SAME concepts but with different wording:
${previousResults.wrongQuestions.map((q, i) => `
${i + 1}. Question: "${q.question}"
   They answered: "${q.userAnswer}"
   Correct answer was: "${q.correctAnswer}"
`).join('')}

Create questions that:
- Test the same underlying concepts they struggled with
- Use different examples and scenarios
- Help reinforce the correct understanding
- Do NOT repeat the exact same questions`;
    }
    
    // Build known concepts context if available
    let knownConceptsContext = '';
    if (knownConcepts && knownConcepts.length > 0) {
        // Limit to most recent 50 to avoid token limits
        const recentKnown = knownConcepts.slice(0, 50);
        knownConceptsContext = `
IMPORTANT - AVOID THESE MASTERED CONCEPTS:
The student has already demonstrated knowledge of these ${recentKnown.length} concepts/questions. Do NOT ask questions about these same concepts:

${recentKnown.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

Generate questions about DIFFERENT concepts from the material that the student hasn't been tested on yet.
Focus on NEW topics and concepts they haven't mastered.`;
    }
    
    const messages = [
        {
            role: 'system',
            content: `You are an expert quiz generator. Create multiple choice questions that test understanding of the material.

Return a JSON array of questions in this exact format (NO other text, ONLY the JSON array):
[
  {
    "question": "The question text",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correctAnswer": 0,
    "explanation": "Brief explanation of why this is correct",
    "hint": "A helpful hint that guides the student without giving away the answer",
    "topicId": "topic-1"
  }
]

CRITICAL JSON RULES:
- Return ONLY valid JSON - no text before or after the array
- Escape all quotes inside strings with backslash: \"
- Do NOT use smart quotes or special characters
- Do NOT include A), B), C), D) prefixes in options - just the answer text
- Include topicId to indicate which topic the question is from
- Make questions that test real understanding, not just memorization
- Include a mix of difficulty levels
- Each hint should help the student think without revealing the answer`
        },
        {
            role: 'user',
            content: `Generate ${numQuestions} multiple choice quiz questions based on this study material.
${topicContext}
${previousResultsContext}
${knownConceptsContext}

Return ONLY the JSON array, no other text or explanation:

${quizContent.substring(0, 30000)}`
        }
    ];

    const response = await sendPollinationsMessages(messages);
    
    // Clean up the response before parsing
    let cleanedResponse = response
        .trim()
        // Remove any markdown code blocks
        .replace(/^```json?\s*/i, '')
        .replace(/\s*```$/i, '')
        // Remove any leading/trailing text before/after the JSON array
        .replace(/^[^[]*(\[)/s, '$1')
        .replace(/(\])[^\]]*$/s, '$1')
        // Fix common JSON issues
        .replace(/,\s*]/g, ']') // Remove trailing commas
        .replace(/,\s*}/g, '}') // Remove trailing commas in objects
        .trim();
    
    try {
        // Try to parse the cleaned JSON response
        const parsed = JSON.parse(cleanedResponse);
        return Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch (e) {
        console.error('First parse attempt failed:', e.message);
        
        // Try to extract JSON from the response more aggressively
        const jsonMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
        if (jsonMatch) {
            try {
                // Try to fix common issues in the extracted JSON
                let fixedJson = jsonMatch[0]
                    .replace(/,\s*]/g, ']')
                    .replace(/,\s*}/g, '}')
                    // Fix unescaped quotes in strings (common AI mistake)
                    .replace(/:\s*"([^"]*?)(?<!\\)"([^"]*?)"/g, ': "$1\\"$2"');
                
                return JSON.parse(fixedJson);
            } catch (e2) {
                console.error('Failed to parse extracted JSON:', e2.message);
                console.error('Extracted JSON:', jsonMatch[0].substring(0, 500));
            }
        }
        
        console.error('Failed to parse quiz questions:', e);
        console.error('Response preview:', response.substring(0, 500));
        return [];
    }
}

/**
 * Chat with AI about a specific question
 * @param {string} context - Context about what the user is doing (document/quiz tab info)
 * @param {string} userMessage - User's message/question
 * @param {string} studyContent - Related study content for context
 * @param {Array} chatHistory - Previous messages in the conversation
 * @returns {Promise<string>} - AI response
 */
async function chatAboutQuestion(context, userMessage, studyContent, chatHistory = []) {
    const messages = [
        {
            role: 'system',
            content: `You are a helpful study tutor assistant. Be concise, clear, and educational.

CURRENT CONTEXT (IMPORTANT - READ THIS):
${context}

Study material for reference:
${studyContent}

IMPORTANT RULES:
- Pay attention to the CURRENT CONTEXT above - it tells you what question the user is on and what they selected
- If the user asks "what did I select" or similar, refer to the CURRENT CONTEXT
- Use proper line breaks between paragraphs
- Use bullet points (- ) for lists
- Use **bold** for key terms
- Keep responses focused and well-structured
- Use 1-2 relevant emojis max
- Break up long explanations into short paragraphs
- For math: wrap ALL math expressions in dollar signs. Use $...$ for inline, $$...$$ for blocks
- NEVER use backslashes before dollar amounts - write $720 not \\$720
- NEVER use \\[ \\] or [ ] brackets for math
- Keep math simple: $0.6 \\times 1200 = 720$ not $0.6 \\times \\$1{,}200$
- For currency in math, just use the number: $720 + 720 = 1440$ then say "= \\$1,440" outside the math
- NEVER generate markdown tables (|---|) - use bullet points or numbered lists instead`
        }
    ];

    // Add chat history (last 10 messages to avoid token limits)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current user message
    messages.push({
        role: 'user',
        content: userMessage
    });

    return await sendPollinationsMessages(messages);
}

/**
 * Get recommended number of questions based on content length and topic count
 * @param {string} content - Study content
 * @param {number} topicCount - Number of topics in the study
 * @returns {Object} - Recommendation with min, max, and suggested values
 */
function getQuestionRecommendation(content, topicCount = 1) {
    // 10 questions per topic is the target
    const questionsPerTopic = 10;
    
    // Calculate based on topic count (10 questions per topic)
    const suggested = topicCount * questionsPerTopic;
    const min = Math.max(5, topicCount * 5); // At least 5 questions per topic minimum
    const max = topicCount * 15; // Up to 15 questions per topic maximum
    
    const label = topicCount > 1 
        ? `${topicCount} topics × 10 questions` 
        : '1 topic';
    
    return { min, max, suggested, label };
}

/**
 * Analyze quiz results and provide personalized feedback
 * @param {Array} results - Array of quiz results with question, userAnswer, correctAnswer, isCorrect
 * @param {string} studyContent - The study content for context
 * @param {Array} topics - Topics for context
 * @returns {Promise<string>} - Markdown formatted analysis
 */
async function analyzeQuizResults(results, studyContent, topics = []) {
    const correct = results.filter(r => r.isCorrect).length;
    const total = results.length;
    const percentage = Math.round((correct / total) * 100);
    
    const wrongQuestions = results.filter(r => !r.isCorrect);
    const correctQuestions = results.filter(r => r.isCorrect);
    
    const messages = [
        {
            role: 'system',
            content: `You are a helpful study tutor analyzing quiz results. Provide encouraging, constructive feedback.

Generate a personalized analysis in markdown format. Be specific about what the student understands well and what they need to work on.

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## 📊 Performance Summary

[Brief encouraging summary based on score]

## ✅ What You Know Well

[List specific concepts they got right - be specific about the topics/concepts, not just "question 1"]

## ⚠️ Areas to Improve

[For each wrong answer, explain:
- The concept that was tested
- Why the correct answer is right
- A brief tip to remember it]

## 📚 Study Recommendations

[Specific actionable advice on what to review]

## 💪 Next Steps

[Encouraging closing with specific suggestions]

Keep it concise but helpful. Use bullet points. Be specific about concepts, not question numbers.`
        },
        {
            role: 'user',
            content: `Analyze these quiz results:

Score: ${correct}/${total} (${percentage}%)

CORRECT ANSWERS:
${correctQuestions.map(q => `- Question: "${q.question}"\n  Answer: "${q.correctAnswer}"`).join('\n\n')}

INCORRECT ANSWERS:
${wrongQuestions.map(q => `- Question: "${q.question}"\n  User answered: "${q.userAnswer}"\n  Correct answer: "${q.correctAnswer}"`).join('\n\n')}

Study material context (for understanding the topics):
${studyContent.substring(0, 5000)}

Provide a helpful, encouraging analysis.`
        }
    ];

    return await sendPollinationsMessages(messages);
}

/**
 * Generate a TikTok-style video script from topic content
 * @param {string} topicTitle - Title of the topic
 * @param {string} topicContent - Content of the topic
 * @returns {Promise<string>} - Video script
 */
async function generateVideoScript(topicTitle, topicContent) {
    const messages = [
        {
            role: 'system',
            content: `You are a viral TikTok content creator who makes educational content engaging and memorable.

Create a short, punchy script for a TikTok video (30-60 seconds when spoken) that explains the key concepts.

RULES:
- Write in a conversational, energetic tone like you're talking to a friend
- Use short sentences that are easy to follow
- Include hooks and attention grabbers
- Make it entertaining while educational
- Each line should be a separate thought/sentence
- NO emojis, NO hashtags, NO "like and subscribe"
- Just the spoken script, nothing else
- Keep it under 150 words
- Start with a hook question or bold statement
- End with a memorable takeaway`
        },
        {
            role: 'user',
            content: `Create a TikTok script about: ${topicTitle}

Key content to cover:
${topicContent.substring(0, 3000)}

Write ONLY the script text, one sentence per line:`
        }
    ];

    const script = await sendPollinationsMessages(messages);
    
    // Clean up the script
    return script
        .replace(/^(Script:|Here's the script:|TikTok Script:)/gi, '')
        .trim();
}

/**
 * Stream chat messages using SSE with Pollinations AI
 * @param {string} context - The context for the chat
 * @param {string} userMessage - The user's message
 * @param {string} studyContent - The study content for context
 * @param {Array} chatHistory - Previous chat history
 * @param {Object} res - Express response object for streaming
 * @returns {Promise<string>} - The complete response text
 */
async function streamChatMessage(context, userMessage, studyContent, chatHistory = [], res) {
    const apiEndpoint = 'https://text.pollinations.ai/openai';
    
    const messages = [
        {
            role: 'system',
            content: `You are a helpful study tutor assistant. Be concise, clear, and educational.

CURRENT CONTEXT (IMPORTANT - READ THIS):
${context}

Study material for reference:
${studyContent}

IMPORTANT RULES:
- Pay attention to the CURRENT CONTEXT above - it tells you what question the user is on and what they selected
- If the user asks "what did I select" or similar, refer to the CURRENT CONTEXT
- Use proper line breaks between paragraphs
- Use bullet points (- ) for lists
- Use **bold** for key terms
- Keep responses focused and well-structured
- Use 1-2 relevant emojis max
- Break up long explanations into short paragraphs
- For math: wrap ALL math expressions in dollar signs. Use $...$ for inline, $$...$$ for blocks
- NEVER use backslashes before dollar amounts - write $720 not \\$720
- NEVER use \\[ \\] or [ ] brackets for math
- Keep math simple: $0.6 \\times 1200 = 720$ not $0.6 \\times \\$1{,}200$
- For currency in math, just use the number: $720 + 720 = 1440$ then say "= \\$1,440" outside the math
- NEVER generate markdown tables (|---|) - use bullet points or numbered lists instead`
        }
    ];

    // Add chat history (last 10 messages to avoid token limits)
    const recentHistory = chatHistory.slice(-10);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role,
            content: msg.content
        });
    }

    // Add current user message
    messages.push({
        role: 'user',
        content: userMessage
    });
    
    try {
        const response = await axios.post(
            apiEndpoint,
            {
                messages: messages,
                model: 'openai',
                stream: true
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 300000,
                responseType: 'stream'
            }
        );

        let fullContent = '';
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            continue;
                        }
                        
                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                fullContent += content;
                                // Send the chunk to the client
                                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            });

            response.data.on('end', () => {
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                resolve(fullContent);
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
                reject(err);
            });
        });
    } catch (error) {
        console.error('Stream request error:', error);
        throw error;
    }
}

module.exports = {
    sendPollinationsMessages,
    formatStudyDocument,
    generateQuizQuestions,
    chatAboutQuestion,
    streamChatMessage,
    getQuestionRecommendation,
    analyzeQuizResults,
    generateVideoScript
};
