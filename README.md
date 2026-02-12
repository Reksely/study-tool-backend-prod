# Study Tool Backend

A backend API for a study tool application that supports document uploads, processing, and study session management.

## Features

- User authentication
- Document upload and processing (PDF, PowerPoint, Word, Excel, OpenDocument formats)
- Study session management
- MongoDB database integration
- CORS support for frontend integration

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud instance)

## Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd study-tool-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory (use `.env.example` as a template):
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```
MONGODB_URI=your_mongodb_connection_string
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-url.com
PORT=3005
GOOGLE_CLIENT_ID=your-google-oauth-client-id
JWT_SECRET=your-secret-jwt-key-here-use-long-random-string
```

## Running the Application

Start the server:
```bash
node index.js
```

The server will run on `http://localhost:3005` (or the port specified in your `.env` file).

## API Endpoints

- `GET /` - Health check endpoint
- `/api/auth` - Authentication routes
- `/api/studies` - Study session routes

## File Upload

The API supports file uploads with the following formats:
- PDF (.pdf)
- PowerPoint (.ppt, .pptx, .odp)
- Word (.doc, .docx, .odt)
- Excel (.xls, .xlsx, .ods)

Maximum file size: 50MB per file

## License

ISC
