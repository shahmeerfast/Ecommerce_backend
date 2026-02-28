import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Gemini AI client with configuration
const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
});

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
};

// Log API key status on startup
console.log('Gemini API Configuration:', {
    keyPresent: !!process.env.GEMINI_API_KEY,
    keyValid: process.env.GEMINI_API_KEY?.startsWith('AIza'),
    keyLength: process.env.GEMINI_API_KEY?.length
});

// Store conversation history (in production, use Redis or MongoDB)
const conversationHistory = new Map();

// Fallback responses for when AI is unavailable
const fallbackResponses = [
    "I apologize, but I'm currently experiencing technical difficulties. Please try again later or contact our support team for assistance.",
    "I'm temporarily unavailable. Please try again in a few minutes or contact our support team.",
    "I'm having trouble processing your request right now. Please try again later or reach out to our support team.",
    "I'm currently experiencing some issues. Please try again later or contact our support team for help.",
    "I'm temporarily unable to respond. Please try again in a few minutes or contact our support team."
];

// Get a random fallback response
const getFallbackResponse = () => {
    const randomIndex = Math.floor(Math.random() * fallbackResponses.length);
    return fallbackResponses[randomIndex];
};

// Validate the API key format
const isValidApiKey = (key) => {
    return key && key.startsWith('AIza');
};

// Send message to Gemini AI
export const sendMessage = async (req, res) => {
    try {
        console.log('Received request body:', req.body);
        const { message, userId } = req.body;

        // Validate request
        if (!message || !userId) {
            console.log('Invalid request - missing fields:', { message: !!message, userId: !!userId });
            return res.status(400).json({
                success: false,
                error: 'invalid_request',
                message: 'Message and userId are required'
            });
        }

        // Validate API key
        if (!apiKey || !apiKey.startsWith('AIza')) {
            console.error('Invalid Gemini API key configuration:', {
                keyPresent: !!apiKey,
                keyValid: apiKey?.startsWith('AIza')
            });
            return res.status(503).json({
                success: false,
                error: 'invalid_api_key',
                message: 'AI service is not properly configured'
            });
        }

        console.log('Processing message:', {
            userId,
            messageLength: message.length,
            messagePreview: message.substring(0, 50)
        });

        try {
            // Create chat session
            const chatSession = model.startChat({
                generationConfig,
                history: [],
            });

            // Send message and get response
            console.log('Sending message to Gemini AI:', message);
            const result = await chatSession.sendMessage(message);
            const aiResponse = result.response.text();

            console.log('AI Response:', {
                length: aiResponse.length,
                preview: aiResponse.substring(0, 50)
            });

            return res.status(200).json({
                success: true,
                message: aiResponse
            });

        } catch (geminiError) {
            console.error('Gemini AI Error:', {
                name: geminiError.name,
                message: geminiError.message,
                stack: geminiError.stack
            });

            // Handle specific error cases
            if (geminiError.message?.includes('API key not valid')) {
                return res.status(503).json({
                    success: false,
                    error: 'invalid_api_key',
                    message: 'Invalid API key configuration'
                });
            }

            if (geminiError.message?.includes('PERMISSION_DENIED')) {
                return res.status(503).json({
                    success: false,
                    error: 'permission_denied',
                    message: 'API key does not have permission to access the service'
                });
            }

            if (geminiError.message?.includes('quota')) {
                return res.status(503).json({
                    success: false,
                    error: 'quota_exceeded',
                    message: 'Service quota has been exceeded'
                });
            }

            // Default error response
            return res.status(503).json({
                success: false,
                error: 'service_error',
                message: 'AI service is temporarily unavailable',
                details: process.env.NODE_ENV === 'development' ? geminiError.message : undefined
            });
        }

    } catch (error) {
        console.error('Server Error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'Internal server error'
        });
    }
};

// Clear chat history
export const clearHistory = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'invalid_request',
                message: 'UserId is required'
            });
        }

        // Here you would typically clear the chat history from your database
        // For now, we'll just return success
        return res.status(200).json({
            success: true,
            message: 'Chat history cleared successfully'
        });

    } catch (error) {
        console.error('Clear History Error:', error);
        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'Failed to clear chat history'
        });
    }
}; 