# BlipnGo QR Code Generator - AI Agent Instructions

## Project Overview
BlipnGo is a business QR code generator application that creates customized QR codes linking to multiple social media platforms. The application uses Express.js for the backend, Prisma with PostgreSQL for data management, and EJS for view templating.

## Key Components

### Data Model (`prisma/schema.prisma`)
- Core entity is `Business` with social media URLs and styling preferences
- Related entities: `Step` for custom instructions, `RedirectHistory` and `ScanEvent` for analytics
- Database uses PostgreSQL with Prisma ORM

### Server Architecture (`server.js`)
- Express.js application with EJS view engine
- Basic authentication for admin routes (`middleware/basicAuth.js`)
- Supported platforms defined in `SUPPORTED_PLATFORMS` constant:
  ```javascript
  const SUPPORTED_PLATFORMS = {
    instagram: 'instagram',
    tiktok: 'tiktok',
    youtube: 'youtube',
    google: 'googleReview'
  };
  ```

### Views Structure (`views/`)
- `business.ejs` - Business management interface
- `poster.ejs` - QR code poster generation
- `index.ejs` - Landing page

## Development Workflow

### Environment Setup
1. Required environment variables:
   ```
   DATABASE_URL=postgresql://...
   BASE_URL=http://localhost:3000 (or production URL)
   ADMIN_USER=admin
   ADMIN_PASS=your_secure_password
   ```
2. Install dependencies: `npm install`
3. Run database migrations: `npx prisma migrate dev`
4. Start server: `npm start`

### Key Integration Points
- QR Code Generation: Uses `qrcode` npm package
- Authentication: Basic auth middleware in `middleware/basicAuth.js`
- Database: Prisma Client for all database operations

### Project Conventions
- URL handling: All platform URLs are stored with full URLs (including http/https)
- Form parsing: Use `isOn()` helper for checkbox/boolean values
- Styling: Custom colors stored in hex format (e.g., "#FF0000")

## Common Tasks
- Adding new social platform:
  1. Add to `SUPPORTED_PLATFORMS` in `server.js`
  2. Add URL field to Prisma schema
  3. Update view templates to include new platform
- Database schema changes: Use `npx prisma migrate dev --name descriptive_name`
- Testing QR codes: Access `/{business-slug}` to see live QR poster