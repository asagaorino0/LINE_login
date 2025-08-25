# Overview

This is a full-stack web application built as a LINE Bot integration with Google Forms submission capabilities. The application allows LINE users to authenticate via LIFF (LINE Front-end Framework), submit data to Google Forms with additional messages, and track their submission history. The system uses a modern React frontend with Express.js backend, PostgreSQL database via Drizzle ORM, and integrates with LINE's platform for user authentication and profile management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query for server state management and React hooks for local state
- **Routing**: Wouter for client-side routing
- **LINE Integration**: LIFF (LINE Front-end Framework) for user authentication and profile access

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with JSON responses
- **Error Handling**: Centralized error handling middleware with structured error responses
- **Request Logging**: Custom middleware for API request logging with response capture

## Data Storage
- **Database**: PostgreSQL with Neon Database as the cloud provider
- **ORM**: Drizzle ORM for type-safe database operations and migrations
- **Schema Design**: 
  - `users` table for basic user authentication
  - `line_users` table for LINE user profiles (userId, displayName, pictureUrl)
  - `form_submissions` table for tracking Google Forms submissions
- **Storage Interface**: Abstracted storage layer with in-memory fallback for development

## Authentication & Authorization
- **LINE Authentication**: LIFF-based authentication for LINE users
- **Session Management**: PostgreSQL-based session storage using connect-pg-simple
- **User Management**: Dual user system supporting both traditional users and LINE users

## Third-Party Integrations
- **LINE Platform**: LIFF SDK for user authentication and profile data
- **Google Forms**: Direct form submission via HTTP POST to Google Forms endpoints
- **Database**: Neon Database (PostgreSQL) for persistent data storage

## Key Design Decisions

### Monolithic Architecture
The application uses a monolithic structure with client and server code in the same repository, enabling shared TypeScript types and simplified deployment. This approach reduces complexity for a focused use case while maintaining clear separation between frontend and backend concerns.

### Storage Abstraction
Implemented an interface-based storage layer that supports both PostgreSQL (production) and in-memory storage (development/testing), allowing for flexible deployment and easier testing without database dependencies.

### LIFF Integration Strategy
Chosen LIFF over LINE Messaging API for direct user interaction, enabling a web-based interface within the LINE app while maintaining access to user profile information and authentication state.

### Form Submission Architecture
Direct submission to Google Forms using `no-cors` mode to bypass CORS restrictions, with local tracking in the database for submission history and additional metadata storage.

### UI Component Strategy
Leveraged shadcn/ui for consistent, accessible component library built on Radix UI primitives, providing both flexibility and design consistency while maintaining full customization capabilities.