# Changelog

All notable changes to the Email to Calendar AI Agent extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-11

### Added
- Initial release
- Gmail monitoring every 5 minutes
- AI-powered event extraction using OpenAI GPT-4o-mini
- Google Calendar integration
- MongoDB Atlas synchronization via Realm Web SDK
- Google OAuth 2.0 authentication
- Automatic logistics email detection
- Smart event creation with:
  - Title and description extraction
  - Date/time parsing (including relative dates)
  - Location extraction
  - Event type classification
- Background service worker (no UI required)
- Notification system for event creation
- Duplicate prevention
- Retry logic with exponential backoff
- Comprehensive error handling
- Debug logging system
- Support for:
  - Package deliveries
  - Flight bookings
  - Hotel reservations
  - Service appointments
  - Meeting confirmations
  - Pickup notifications

### Configuration
- Polling interval: 5 minutes (configurable)
- Email lookback: 24 hours
- Max emails per poll: 20
- AI confidence threshold: 0.5
- Retry attempts: 3 with exponential backoff

### Documentation
- README.md with full feature list
- SETUP_GUIDE.md with step-by-step instructions
- TESTING.md with comprehensive test cases
- DEPLOYMENT.md with deployment options

### Third-Party Integrations
- Gmail API v1
- Google Calendar API v3
- OpenAI API (GPT-4o-mini)
- MongoDB Atlas App Services
- MongoDB Realm Web SDK v2.0.1

### Security
- OAuth 2.0 token management
- Secure API key storage in Chrome sync storage
- User-scoped database access
- No email content storage (processed in real-time only)

---

## [Unreleased]

### Planned Features
- [ ] Support for recurring events
- [ ] Event editing from extension
- [ ] Event deletion capability
- [ ] Multiple calendar support
- [ ] Custom keyword management
- [ ] AI prompt customization
- [ ] Whitelist/blacklist for senders
- [ ] Email templates for testing
- [ ] Usage analytics dashboard
- [ ] Cost tracking
- [ ] Browser action popup with stats
- [ ] Manual event creation
- [ ] Undo/redo functionality
- [ ] Event conflict detection
- [ ] Smart scheduling suggestions

### Known Issues
- None reported yet

---

## Version History

### Version Numbering

- **1.x.x**: Initial stable release
- **x.1.x**: New features, backward compatible
- **x.x.1**: Bug fixes and patches

---

## How to Report Issues

Found a bug? Please open an issue on GitHub with:
- Chrome version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Console logs (if applicable)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Code style
- Pull request process
- Testing requirements
- Documentation standards

