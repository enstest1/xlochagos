# 🏛️ X-Lochagos: AI Social Media Agents Climbing the Digital Ranks

![X-Lochagos Project Image](mvp/assets/X_LOCHAGOS.png)

In ancient Greece, a "Lochagos" was a soldier who climbed the ranks through merit and strategy, leading a small unit of hoplites. X-Lochagos brings this same competitive spirit to social media, deploying intelligent AI agents that autonomously engage, research, and post to climb the digital leaderboards on platforms like X (formerly Twitter).

This project is built upon the robust CypherSwarm architecture, designed for creating sophisticated, human-like AI social media agents.

## 🚀 Features

*   **Multi-Agent System**: Deploy and manage multiple AI agents, each with unique personalities and objectives.
*   **Personality-Driven Engagement**: Agents interact with posts (liking, commenting) using personality-specific templates and human-like delays.
*   **Real-time Research & Content Generation**: Agents monitor specific accounts and RSS feeds to gather up-to-date information, then generate original posts.
*   **Supabase AI Memory System**: A robust memory system powered by Supabase stores engagement history, research content, learning patterns, and agent personalities, enabling continuous learning and intelligence sharing.
*   **Human-like Behavior**: Implements staggered responses, random delays, and intelligent post selection to avoid bot detection.
*   **Secure & Persistent Sessions**: Utilizes cookie-based authentication for persistent logins, avoiding repeated login attempts.
*   **Leaderboard Focus**: Designed to help agents strategically engage and generate content to improve their visibility and influence, effectively "climbing the digital ranks."

## 🛠️ Setup and Deployment

### Prerequisites

*   Node.js (v18 or higher)
*   npm
*   Supabase account
*   X (Twitter) accounts for your agents

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/enstest1/xlochagos.git
    cd xlochagos/mvp
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    Create a `.env` file in the `mvp/` directory with your X account credentials and Supabase API keys. Refer to `SETUP_SUPABASE.md` for detailed instructions.
    ```
    X_USERNAME=your_x_username
    X_PASSWORD=your_x_password
    SUPABASE_URL=your_supabase_url
    SUPABASE_ANON_KEY=your_supabase_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    ```
4.  **Initialize Supabase:**
    Follow the instructions in `mvp/SETUP_SUPABASE.md` to set up your Supabase database schema.
5.  **Run in Daemon Mode:**
    ```bash
    npm run dev -- --daemon
    ```
    This will run the agents in the background, continuously monitoring and engaging.

### Fly.io Deployment

For secure and scalable deployment on Fly.io:

1.  **Install Fly.io CLI:**
    ```bash
    curl -L https://fly.io/install.sh | sh
    ```
2.  **Login to Fly.io:**
    ```bash
    fly auth login
    ```
3.  **Create a new Fly.io app:**
    ```bash
    fly launch
    ```
    Follow the prompts.
4.  **Set Environment Variables (Secrets):**
    Do NOT commit your `.env` file to GitHub. Instead, set your secrets directly on Fly.io:
    ```bash
    fly secrets set X_USERNAME="your_x_username" X_PASSWORD="your_x_password" SUPABASE_URL="your_supabase_url" SUPABASE_ANON_KEY="your_supabase_anon_key" SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
    ```
5.  **Deploy:**
    ```bash
    fly deploy
    ```

## 🎯 Live Deployment Configuration

### Agent Behavior (Live Mode)
- **Monitoring**: `@pelpa333` posts for mentions of `@trylimitless`, `@bankrbot`, `@wallchain_xyz`
- **Engagement**: Max 5 likes/day, 2 comments/day with human-like delays (30-120 minutes)
- **Content Generation**: 2 posts/day based on real-time research from monitored accounts
- **Research**: Continuous monitoring of target accounts with Supabase memory storage

### Security Features
- **Persistent Sessions**: Cookie-based authentication to avoid repeated logins
- **Human-like Patterns**: Random delays, staggered responses, natural engagement timing
- **Secure Storage**: All sensitive data stored as Fly.io secrets, never in code

## 📚 Documentation

*   `doc/devlogs.md`: Detailed development logs and project progress
*   `mvp/SETUP_SUPABASE.md`: Instructions for setting up the Supabase database
*   `mvp/config/accounts.yaml`: Configuration for agent personalities, monitoring, and content generation

## 🏗️ Architecture

### Core Components
- **AccountMonitor**: Handles post monitoring and engagement with personality-driven responses
- **ResearchMonitor**: Collects real-time content from target accounts for post generation
- **AI Memory Service**: Supabase-backed memory system for learning and intelligence sharing
- **Content Variation Engine**: Generates diverse, engaging posts from research data
- **Health Check System**: Monitors agent status and performance

### Technology Stack
- **Backend**: Node.js, TypeScript
- **Database**: Supabase (PostgreSQL with real-time capabilities)
- **Authentication**: Cookie-based X API integration
- **Deployment**: Fly.io with environment-based configuration
- **Monitoring**: Built-in health checks and logging

## 🤖 Agent Personalities

Each agent has a unique personality defined in `config/accounts.yaml`:
- **Bio & Lore**: Background story and character traits
- **Topics**: Preferred content areas and expertise
- **Style**: Communication patterns for different contexts
- **Comment Templates**: Personality-specific engagement responses

## 🔒 Security & Privacy

- **No Sensitive Data**: All passwords, cookies, and API keys stored as environment variables
- **Private Repositories**: Supports both public and private GitHub repositories
- **Secure Deployment**: Fly.io secrets management for production environments
- **Human-like Behavior**: Advanced anti-detection mechanisms

## 📈 Performance & Scalability

- **Multi-Account Support**: Deploy multiple agents with different personalities
- **Real-time Processing**: Continuous monitoring with efficient resource usage
- **Memory Optimization**: Smart Supabase storage with automatic cleanup
- **Horizontal Scaling**: Fly.io deployment supports easy scaling

## 🚀 Getting Started

1. Fork this repository
2. Set up your Supabase project following `mvp/SETUP_SUPABASE.md`
3. Configure your agent personalities in `mvp/config/accounts.yaml`
4. Set up environment variables for your X accounts
5. Deploy to Fly.io or run locally in daemon mode

## 📄 License

This project is open source and available under the MIT License.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For support and questions, please open an issue on GitHub.

---

**Built with ❤️ for the digital leaderboards. Climb the ranks! 🏛️⚔️**
