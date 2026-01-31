# OpenClaw Quick Start Guide

## ✅ Setup Complete!

OpenClaw has been cloned and built successfully. Here's what to do next:

## Step 1: Run the Onboarding Wizard

The onboarding wizard will guide you through:

- AI model configuration (Anthropic Claude & OpenAI)
- Messaging platform setup (WhatsApp, Telegram, Slack, Signal, etc.)
- Voice capabilities with ElevenLabs
- Security settings

Run this command in your terminal:

```bash
./run-openclaw.sh onboard --install-daemon
```

This will:

1. Ask security questions
2. Configure AI providers (you'll need API keys)
3. Set up messaging channels
4. Configure the Gateway daemon

## Step 2: Prepare API Keys

Before running onboarding, have these ready:

### AI Models

- **Anthropic API key**: https://console.anthropic.com/
- **OpenAI API key**: https://platform.openai.com/api-keys

### Messaging Platforms

- **Telegram**: Create bot via @BotFather, get token
- **Slack**: Create app at api.slack.com
- **WhatsApp**: Business API credentials (or use whatsapp-web.js)
- **Signal**: Requires signal-cli setup
- **iMessage**: macOS only, uses AppleScript

### Voice (Optional)

- **ElevenLabs API key**: https://elevenlabs.io/

## Step 3: Start the Gateway

After onboarding, start the Gateway:

```bash
./run-openclaw.sh gateway --port 18789 --verbose
```

## Step 4: Test It

Send a message to your assistant:

```bash
./run-openclaw.sh agent --message "Hello! Tell me about yourself"
```

## Common Commands

```bash
# Run onboarding wizard
./run-openclaw.sh onboard --install-daemon

# Start Gateway
./run-openclaw.sh gateway --port 18789 --verbose

# Send test message
./run-openclaw.sh agent --message "your message here"

# Check system health
./run-openclaw.sh doctor

# View configuration
./run-openclaw.sh config list
```

## Configuration

Your configuration will be stored in:

- `~/.openclaw/` - Main config directory
- `~/.openclaw/config.yaml` - Main configuration file
- `~/.openclaw/skills/` - Custom skills

## Documentation

- Full docs: https://docs.openclaw.ai
- Getting Started: https://docs.openclaw.ai/start/getting-started
- Channels: https://docs.openclaw.ai/channels
- Security: https://docs.openclaw.ai/gateway/security

## Troubleshooting

If you encounter issues:

1. Check Node version: `node --version` (should be ≥22.12.0)
2. Run diagnostics: `./run-openclaw.sh doctor`
3. Check logs: `~/.openclaw/logs/`

## What's Configured

Based on your preferences:

- ✓ Full deployment (local first)
- ✓ All messaging platforms (except Discord - disabled)
- ✓ Anthropic Claude + OpenAI models
- ✓ Full voice with ElevenLabs
- ✓ Live Canvas visual workspace
- ✓ Open security mode (no pairing)
- ✓ Full developer tools suite
- ✓ PostgreSQL for persistence
- ✓ Docker sandboxing for groups
- ✓ Hybrid skills (ClawHub + custom)

## Next Steps

1. Run the onboarding wizard: `./run-openclaw.sh onboard --install-daemon`
2. Follow the prompts to configure your setup
3. Start the Gateway
4. Connect your first messaging platform
5. Test with a message

Enjoy your personal AI assistant!

## Multiple agents and cloud (Render)

To run several agents, each with its own identity (email, phone, channels):

- Deploy **one Render web service per identity**. Each needs its own disk and env vars; see [Deploy on Render](https://docs.openclaw.ai/render) and the “Multiple agents (separate identities)” section.
- Add agents by editing `render.yaml`: duplicate the service block, give each a unique `name` and `disk.name`, then sync the Blueprint.
- Use **Render's dashboard** to manage services, logs, env vars, and Shell access. The in-app Control UI (`/openclaw`) is per-gateway only; for a single fleet dashboard you'd build a small custom app.
