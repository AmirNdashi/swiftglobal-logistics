# SwiftGlobal Logistics

A modern, professional logistics and freight company website with integrated real-time universal parcel tracking, AI-powered chatbot support, and a comprehensive admin dashboard for managing shipments and customer inquiries.

## 🌟 Overview

SwiftGlobal Logistics is a full-featured logistics platform designed for freight forwarding companies. The website provides customers with real-time shipment tracking across 1,200+ carriers worldwide, while the admin panel enables efficient management of shipments, messages, and customer interactions.

## ✨ Key Features

### Customer-Facing Features
- **Universal Parcel Tracking**: Track shipments across 1,200+ carriers worldwide through TrackingMore API integration
- **Service Pages**: Dedicated pages for Sea Freight, Air Freight, Land Freight, Customs Clearance, Warehousing, and Project Cargo
- **AI-Powered Chatbot**: Intelligent chatbot with human handoff capability for 24/7 customer support
- **Contact Form**: Professional contact form with EmailJS integration for quote requests
- **Responsive Design**: Fully optimized for desktop, tablet, and mobile devices
- **Modern UI/UX**: Smooth animations, intuitive navigation, and professional design
- **SEO Optimized**: Complete with sitemap, meta tags, and structured data for search engines

### Admin Dashboard Features
- **Shipment Management**: Add, update, and delete shipments with Cloudinary image storage
- **Message Management**: View and manage customer messages from the contact form
- **Chat Session Monitoring**: Real-time monitoring of chatbot conversations with human takeover capability
- **Authentication**: Secure admin login with Firebase Authentication
- **Real-time Updates**: Firestore real-time listeners for instant data synchronization
- **Image Upload**: Cloudinary integration for parcel image storage and display

## 🛠️ Tech Stack

### Frontend
- **HTML5**: Semantic markup for accessibility and SEO
- **CSS3**: Custom CSS with CSS variables for theming
- **Vanilla JavaScript**: No frameworks, pure JavaScript for optimal performance
- **AOS Animation Library**: Smooth scroll animations
- **Font Awesome Icons**: Comprehensive icon library
- **Google Fonts**: Inter and Poppins typography

### Backend & Services
- **Firebase Authentication**: Secure admin authentication
- **Firebase Firestore**: Real-time database for shipments, messages, and chat sessions
- **Cloudinary**: Cloud image storage for parcel images
- **EmailJS**: Contact form email delivery
- **TrackingMore API**: Universal parcel tracking across 1,200+ carriers

### Deployment
- **GitHub Pages**: Static site hosting
- **Custom Domain**: swiftglobalogistics.com

## 📁 Project Structure

```
swiftglobal-logistics/
├── admin/
│   ├── admin.js          # Admin dashboard logic
│   ├── admin.css         # Admin dashboard styles
│   ├── dashboard.html    # Admin dashboard UI
│   ├── firebase.js       # Firebase configuration and functions
│   └── shipments.js      # Shipment management logic
├── css/
│   ├── style.css         # Main stylesheet
│   ├── animations.css    # Animation styles
│   ├── responsive.css    # Mobile responsiveness
│   └── chatbot.css       # Chatbot styles
├── js/
│   ├── main.js           # Main site JavaScript
│   ├── tracking.js       # Tracking functionality
│   ├── chatbot.js        # Chatbot logic
│   └── form.js           # Contact form handling
├── images/
│   ├── hero/             # Hero section images
│   ├── services/         # Service page images
│   ├── about/            # About page images
│   └── gallery/          # Gallery images
├── pages/
│   ├── air-freight.html
│   ├── sea-freight.html
│   ├── land-freight.html
│   ├── customs.html
│   ├── warehousing.html
│   └── project-cargo.html
├── index.html            # Homepage
├── about.html            # About page
├── contact.html          # Contact page
├── tracking.html         # Tracking page
├── services.html         # Services overview
├── news.html             # News page
└── README.md             # This file
```

## 🚀 Getting Started

### Prerequisites
- A modern web browser
- VS Code with Live Server extension (recommended for local development)

### Local Development
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/swiftglobal-logistics.git
   ```

2. Navigate to the project directory:
   ```bash
   cd swiftglobal-logistics
   ```

3. Open the project in VS Code

4. Install the Live Server extension

5. Right-click on `index.html` and select "Open with Live Server"

### Admin Dashboard Setup
To use the admin dashboard, you'll need to configure Firebase:

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Authentication (Email/Password)
3. Create Firestore database
4. Update the Firebase configuration in `admin/firebase.js` with your credentials
5. Set up Firestore security rules for proper access control

### Cloudinary Setup
For image uploads:
1. Create a Cloudinary account at [cloudinary.com](https://cloudinary.com)
2. Create an unsigned upload preset
3. Update the Cloudinary configuration in `admin/firebase.js`:
   ```javascript
   const CLOUDINARY_CLOUD_NAME = "your-cloud-name";
   const CLOUDINARY_UPLOAD_PRESET = "your-upload-preset";
   const CLOUDINARY_FOLDER = "shipments";
   ```

### EmailJS Setup
For contact form:
1. Create an EmailJS account at [emailjs.com](https://emailjs.com)
2. Create an email service and template
3. Update the EmailJS configuration in `contact.html`

## 🌐 Live Site
https://www.swiftglobalogistics.com

## 📄 License
This project is proprietary and confidential.

## 👥 Support
For support or inquiries, contact info@swiftglobalogistics.com