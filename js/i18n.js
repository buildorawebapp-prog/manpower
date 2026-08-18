/* ==========================================================================
   Go Hire Consultancy — Translations (i18n)
   English is default (priority). Side languages: Hindi, Bengali, Tamil,
   Telugu, Marathi. Add more languages here later without touching HTML.
   Usage in HTML: <span data-i18n="nav.home"></span>
   ========================================================================== */

const LANGS = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "hi", label: "हिन्दी",    flag: "🇮🇳" },
  { code: "bn", label: "বাংলা",     flag: "🇧🇩" },
  { code: "ta", label: "தமிழ்",     flag: "🇮🇳" },
  { code: "te", label: "తెలుగు",    flag: "🇮🇳" },
  { code: "mr", label: "मराठी",     flag: "🇮🇳" },
];

const I18N = {
  en: {
    "brand.tag": "Manpower Solutions",
    "nav.home": "Home", "nav.services": "Services", "nav.locations": "Locations",
    "nav.apply": "Apply for Work", "nav.hire": "Hire Workers", "nav.contact": "Contact",
    "nav.admin": "Admin",

    "hero.badge": "Trusted blue-collar manpower supplier",
    "hero.title1": "Skilled Workers,", "hero.title2": "Delivered On Demand",
    "hero.lead": "Go Hire Consultancy connects verified engineers, plumbers, electricians, welders and more with the companies who need them — fast, reliable, hassle-free.",
    "hero.cta1": "Apply for Work", "hero.cta2": "Need Workers?",
    "hero.stat1": "Verified Workers", "hero.stat2": "Trade Categories", "hero.stat3": "Cities Covered",
    "hero.card": "In-demand trades",
    "hero.avail": "Available",

    "trust.1": "ID Verified Workers", "trust.2": "Same-day Response", "trust.3": "All Trades Covered", "trust.4": "Pan-India Reach",

    "services.eyebrow": "What we supply",
    "services.title": "Every trade, one trusted partner",
    "services.sub": "From skilled engineers to on-site labour, we supply the right people for the job.",
    "services.go": "Request this trade",

    "why.eyebrow": "Why Go Hire Consultancy",
    "why.title": "Built for speed, trust and scale",
    "why.1t": "Verified & Skilled", "why.1p": "Every candidate is screened and their trade skills confirmed before we list them.",
    "why.2t": "Fast Turnaround", "why.2p": "Tell us what you need — we respond the same day with available workers.",
    "why.3t": "All Trades", "why.3p": "Engineers, plumbers, electricians, welders, masons, helpers and many more.",
    "why.4t": "Wide Coverage", "why.4p": "Available across multiple cities and locations, expanding every month.",

    "split.worker.t": "Looking for work?", "split.worker.p": "Register in 2 minutes. Our team contacts you when a matching job opens.",
    "split.worker.b": "Apply as Candidate",
    "split.employer.t": "Need skilled workers?", "split.employer.p": "Tell us your requirement and location. Get matched workers fast.",
    "split.employer.b": "Request Workers",

    "how.eyebrow": "Simple process",
    "how.title": "How it works",
    "how.1t": "Submit your details", "how.1p": "Fill a short form — as a worker looking for a job or an employer who needs staff.",
    "how.2t": "We match & verify", "how.2p": "Our team reviews your request and finds the right people or roles.",
    "how.3t": "We connect you", "how.3p": "We call you directly on your phone or WhatsApp to finalise everything.",

    "contact.title": "Ready to get started?",
    "contact.sub": "Call us or message on WhatsApp — we usually reply within a few hours.",
    "contact.call": "Call Now", "contact.whatsapp": "WhatsApp Us",

    "footer.about": "Go Hire Consultancy We connect skilled and semi-skilled workers from around the world with trusted employers and the right international job opportunities.",
    "footer.company": "Company", "footer.services": "Services", "footer.getstarted": "Get Started",
    "footer.rights": "All rights reserved.",

    // apply page
    "apply.title": "Apply for Work", "apply.sub": "Fill this form and our team will contact you for suitable jobs.",
    "f.name": "Full Name", "f.email": "Email Address", "f.phone": "Phone Number", "f.trade": "Your Trade / Skill",
    "f.exp": "Years of Experience", "f.location": "Your Location / City", "f.message": "Anything else? (optional)",
    "f.selectTrade": "Select your trade", "f.selectExp": "Select experience",
    "apply.submit": "Submit Application",
    "apply.okT": "Application received!", "apply.okP": "Thank you. Our team will contact you soon on your phone or WhatsApp.",

    // hire page
    "hire.title": "Hire Skilled Workers", "hire.sub": "Tell us your requirement — we'll get back with available workers.",
    "f.company": "Company / Your Name", "f.contact": "Contact Person", "f.tradeNeed": "Trade Needed",
    "f.count": "How many workers?", "f.locNeed": "Work Location / City", "f.gender": "Gender", "f.detail": "Requirement details (optional)",
    "hire.submit": "Send Request",
    "hire.okT": "Request received!", "hire.okP": "Thank you. Our team will contact you shortly to discuss your requirement.",

    // locations
    "loc.title": "Where We Operate", "loc.sub": "Search your city to check worker availability.",
    "loc.search": "Search your city or area...",
    "loc.available": "Available", "loc.empty": "No location found. We're expanding — contact us to check your area.",

    "err.required": "This field is required", "err.phone": "Enter a valid phone number",
    "err.email": "Enter a valid email address",
    "err.submit": "Could not submit. Please try again or message us on WhatsApp.",

    // status tracking
    "nav.status": "Check Status",
    "status.title": "Track Your Application",
    "status.sub": "Enter your email and token to view your submission status and chat with our team.",
    "status.email": "Your Email",
    "status.token": "Tracking Token",
    "status.submit": "View Status",
    "status.nosubmissions": "No submissions found. Please check your email and token.",

    // token success
    "token.title": "Submission Successful!",
    "token.subtitle": "Your tracking token is:",
    "token.copy": "Copy Token",
    "token.copied": "Copied!",
    "token.email": "We've also sent this token to your email:",
    "token.important": "Important: Save this token to track your application status.",
    "token.checkStatus": "Check Status Now",
    "token.home": "Back to Home",

    // dashboard
    "dash.title": "Your Submissions",
    "dash.status": "Status",
    "dash.submitted": "Submitted",
    "dash.token": "Token",
    "dash.details": "Details",
    "dash.chat": "Chat with Admin",
    "dash.sendMsg": "Send Message",
    "dash.typeMsg": "Type your message...",
    "dash.noMsgs": "No messages yet. Start a conversation!",
    "dash.you": "You",
    "dash.admin": "Admin",
    "dash.logout": "View Another Submission",

    // status values
    "status.new": "New - Under Review",
    "status.contacted": "Contacted",
    "status.hired": "Hired",
    "status.rejected": "Not Selected",
    "status.closed": "Closed",
  },

  hi: {
    "brand.tag": "मैनपावर समाधान",
    "nav.home": "होम", "nav.services": "सेवाएँ", "nav.locations": "स्थान",
    "nav.apply": "काम के लिए आवेदन", "nav.hire": "वर्कर चाहिए", "nav.contact": "संपर्क", "nav.admin": "एडमिन",

    "hero.badge": "भरोसेमंद ब्लू-कॉलर मैनपावर सप्लायर",
    "hero.title1": "कुशल कामगार,", "hero.title2": "जब चाहिए तब उपलब्ध",
    "hero.lead": "Go Hire Consultancy सत्यापित इंजीनियर, प्लंबर, इलेक्ट्रीशियन, वेल्डर और अन्य कामगारों को उन कंपनियों से जोड़ता है जिन्हें उनकी ज़रूरत है — तेज़, भरोसेमंद और आसान।",
    "hero.cta1": "काम के लिए आवेदन", "hero.cta2": "वर्कर चाहिए?",
    "hero.stat1": "सत्यापित कामगार", "hero.stat2": "ट्रेड श्रेणियाँ", "hero.stat3": "शहर कवर",
    "hero.card": "मांग में ट्रेड", "hero.avail": "उपलब्ध",

    "trust.1": "ID सत्यापित कामगार", "trust.2": "उसी दिन जवाब", "trust.3": "सभी ट्रेड", "trust.4": "पूरे भारत में",

    "services.eyebrow": "हम क्या देते हैं",
    "services.title": "हर ट्रेड, एक भरोसेमंद साथी",
    "services.sub": "कुशल इंजीनियर से लेकर साइट लेबर तक, सही लोग सही काम के लिए।",
    "services.go": "यह ट्रेड चाहिए",

    "why.eyebrow": "Go Hire Consultancy क्यों",
    "why.title": "गति, भरोसा और विस्तार के लिए बना",
    "why.1t": "सत्यापित और कुशल", "why.1p": "हर कामगार की जाँच और स्किल पुष्टि के बाद ही सूची में जोड़ा जाता है।",
    "why.2t": "तेज़ सेवा", "why.2p": "हमें ज़रूरत बताइए — उसी दिन उपलब्ध कामगारों के साथ जवाब देते हैं।",
    "why.3t": "सभी ट्रेड", "why.3p": "इंजीनियर, प्लंबर, इलेक्ट्रीशियन, वेल्डर, मिस्त्री, हेल्पर और बहुत कुछ।",
    "why.4t": "व्यापक कवरेज", "why.4p": "कई शहरों में उपलब्ध, हर महीने बढ़ रहे हैं।",

    "split.worker.t": "काम की तलाश है?", "split.worker.p": "2 मिनट में रजिस्टर करें। मैच होने पर हमारी टीम आपसे संपर्क करेगी।",
    "split.worker.b": "कामगार के रूप में आवेदन",
    "split.employer.t": "कुशल कामगार चाहिए?", "split.employer.p": "अपनी ज़रूरत और स्थान बताएं। जल्दी कामगार पाएं।",
    "split.employer.b": "वर्कर की मांग करें",

    "how.eyebrow": "आसान प्रक्रिया", "how.title": "यह कैसे काम करता है",
    "how.1t": "अपनी जानकारी दें", "how.1p": "एक छोटा फॉर्म भरें — कामगार या कंपनी के रूप में।",
    "how.2t": "हम मैच करते हैं", "how.2p": "हमारी टीम आपकी माँग देखकर सही लोग या काम ढूंढती है।",
    "how.3t": "हम जोड़ते हैं", "how.3p": "फोन या WhatsApp पर सीधे कॉल कर सब तय करते हैं।",

    "contact.title": "शुरू करने के लिए तैयार?",
    "contact.sub": "कॉल करें या WhatsApp पर संदेश भेजें — हम कुछ घंटों में जवाब देते हैं।",
    "contact.call": "अभी कॉल करें", "contact.whatsapp": "WhatsApp करें",

    "footer.about": "Go Hire Consultancy दुनिया भर के कुशल और अर्ध-कुशल कामगारों को विश्वसनीय नियोक्ताओं और सही अंतरराष्ट्रीय नौकरी के अवसरों से जोड़ता है।",
    "footer.company": "कंपनी", "footer.services": "सेवाएँ", "footer.getstarted": "शुरू करें",
    "footer.rights": "सर्वाधिकार सुरक्षित।",

    "apply.title": "काम के लिए आवेदन", "apply.sub": "यह फॉर्म भरें, हमारी टीम उपयुक्त काम के लिए आपसे संपर्क करेगी।",
    "f.name": "पूरा नाम", "f.phone": "फोन नंबर", "f.trade": "आपका ट्रेड / स्किल",
    "f.exp": "अनुभव के वर्ष", "f.location": "आपका शहर", "f.message": "और कुछ? (वैकल्पिक)",
    "f.selectTrade": "अपना ट्रेड चुनें", "f.selectExp": "अनुभव चुनें",
    "apply.submit": "आवेदन जमा करें",
    "apply.okT": "आवेदन प्राप्त हुआ!", "apply.okP": "धन्यवाद। हमारी टीम जल्द ही फोन या WhatsApp पर संपर्क करेगी।",

    "hire.title": "कुशल कामगार किराए पर लें", "hire.sub": "अपनी ज़रूरत बताएं — हम उपलब्ध कामगारों के साथ जवाब देंगे।",
    "f.company": "कंपनी / आपका नाम", "f.contact": "संपर्क व्यक्ति", "f.tradeNeed": "किस ट्रेड की ज़रूरत",
    "f.count": "कितने कामगार?", "f.locNeed": "कार्य स्थान / शहर", "f.gender": "लिंग", "f.detail": "ज़रूरत का विवरण (वैकल्पिक)",
    "hire.submit": "अनुरोध भेजें",
    "hire.okT": "अनुरोध प्राप्त हुआ!", "hire.okP": "धन्यवाद। हमारी टीम जल्द ही आपसे संपर्क करेगी।",

    "loc.title": "हम कहाँ काम करते हैं", "loc.sub": "कामगार उपलब्धता जाँचने के लिए अपना शहर खोजें।",
    "loc.search": "अपना शहर या क्षेत्र खोजें...",
    "loc.available": "उपलब्ध", "loc.empty": "कोई स्थान नहीं मिला। हम बढ़ रहे हैं — अपने क्षेत्र के लिए संपर्क करें।",

    "err.required": "यह फ़ील्ड आवश्यक है", "err.phone": "मान्य फोन नंबर दर्ज करें",
    "err.email": "मान्य ईमेल दर्ज करें",

    "nav.status": "स्टेटस देखें",
    "status.title": "आवेदन ट्रैक करें",
    "status.sub": "अपना ईमेल और टोकन दर्ज करें।",
    "status.email": "आपका ईमेल",
    "status.token": "ट्रैकिंग टोकन",
    "status.submit": "स्टेटस देखें",

    "token.title": "सफलतापूर्वक भेजा गया!",
    "token.subtitle": "आपका ट्रैकिंग टोकन:",
    "token.copy": "कॉपी करें",
    "token.copied": "कॉपी हो गया!",
    "token.email": "यह टोकन आपके ईमेल पर भी भेजा गया है:",
    "token.important": "महत्वपूर्ण: अपने आवेदन की स्थिति जानने के लिए यह टोकन सुरक्षित रखें।",
    "token.checkStatus": "अभी स्टेटस देखें",
    "token.home": "होम पर वापस",

    "dash.title": "आपके आवेदन",
    "dash.status": "स्थिति",
    "dash.submitted": "जमा किया",
    "dash.token": "टोकन",
    "dash.chat": "एडमिन से चैट करें",
    "dash.sendMsg": "संदेश भेजें",
    "dash.typeMsg": "अपना संदेश टाइप करें...",
    "dash.you": "आप",
    "dash.admin": "एडमिन",
  },

  bn: {
    "brand.tag": "ম্যানপাওয়ার সমাধান",
    "nav.home": "হোম", "nav.services": "সেবা", "nav.locations": "অবস্থান",
    "nav.apply": "কাজের আবেদন", "nav.hire": "কর্মী প্রয়োজন", "nav.contact": "যোগাযোগ", "nav.admin": "অ্যাডমিন",

    "hero.badge": "বিশ্বস্ত ব্লু-কলার ম্যানপাওয়ার সরবরাহকারী",
    "hero.title1": "দক্ষ কর্মী,", "hero.title2": "চাহিদা অনুযায়ী সরবরাহ",
    "hero.lead": "Go Hire Consultancy যাচাইকৃত ইঞ্জিনিয়ার, প্লাম্বার, ইলেকট্রিশিয়ান, ওয়েল্ডার ও আরও অনেককে সেই কোম্পানিগুলোর সাথে যুক্ত করে যাদের তাদের প্রয়োজন — দ্রুত, নির্ভরযোগ্য ও ঝামেলাহীন।",
    "hero.cta1": "কাজের আবেদন", "hero.cta2": "কর্মী প্রয়োজন?",
    "hero.stat1": "যাচাইকৃত কর্মী", "hero.stat2": "ট্রেড বিভাগ", "hero.stat3": "শহর কভার",
    "hero.card": "চাহিদাসম্পন্ন ট্রেড", "hero.avail": "উপলব্ধ",

    "trust.1": "ID যাচাইকৃত কর্মী", "trust.2": "একই দিনে সাড়া", "trust.3": "সব ট্রেড", "trust.4": "সারা ভারত",

    "services.eyebrow": "আমরা যা সরবরাহ করি",
    "services.title": "প্রতিটি ট্রেড, একটি বিশ্বস্ত সঙ্গী",
    "services.sub": "দক্ষ ইঞ্জিনিয়ার থেকে সাইট শ্রমিক — সঠিক কাজের জন্য সঠিক মানুষ।",
    "services.go": "এই ট্রেড চাই",

    "why.eyebrow": "কেন Go Hire Consultancy",
    "why.title": "গতি, বিশ্বাস ও সম্প্রসারণের জন্য তৈরি",
    "why.1t": "যাচাইকৃত ও দক্ষ", "why.1p": "প্রতিটি কর্মীকে যাচাই ও দক্ষতা নিশ্চিত করার পরই তালিকাভুক্ত করা হয়।",
    "why.2t": "দ্রুত সেবা", "why.2p": "আপনার প্রয়োজন জানান — একই দিনে উপলব্ধ কর্মী নিয়ে সাড়া দিই।",
    "why.3t": "সব ট্রেড", "why.3p": "ইঞ্জিনিয়ার, প্লাম্বার, ইলেকট্রিশিয়ান, ওয়েল্ডার, রাজমিস্ত্রি, হেল্পার ও আরও অনেক।",
    "why.4t": "বিস্তৃত কভারেজ", "why.4p": "একাধিক শহরে উপলব্ধ, প্রতি মাসে বাড়ছে।",

    "split.worker.t": "কাজ খুঁজছেন?", "split.worker.p": "২ মিনিটে নিবন্ধন করুন। মিল হলে আমাদের দল যোগাযোগ করবে।",
    "split.worker.b": "কর্মী হিসেবে আবেদন",
    "split.employer.t": "দক্ষ কর্মী প্রয়োজন?", "split.employer.p": "আপনার প্রয়োজন ও অবস্থান জানান। দ্রুত কর্মী পান।",
    "split.employer.b": "কর্মীর অনুরোধ",

    "how.eyebrow": "সহজ প্রক্রিয়া", "how.title": "এটি যেভাবে কাজ করে",
    "how.1t": "আপনার তথ্য দিন", "how.1p": "একটি ছোট ফর্ম পূরণ করুন — কর্মী বা নিয়োগকর্তা হিসেবে।",
    "how.2t": "আমরা মিল করি", "how.2p": "আমাদের দল আপনার অনুরোধ দেখে সঠিক মানুষ বা কাজ খুঁজে নেয়।",
    "how.3t": "আমরা যুক্ত করি", "how.3p": "ফোন বা WhatsApp-এ সরাসরি কল করে সব চূড়ান্ত করি।",

    "contact.title": "শুরু করতে প্রস্তুত?",
    "contact.sub": "কল করুন বা WhatsApp-এ বার্তা দিন — আমরা কয়েক ঘণ্টায় উত্তর দিই।",
    "contact.call": "এখনই কল করুন", "contact.whatsapp": "WhatsApp করুন",

    "footer.about": "Go Hire Consultancy সারা বিশ্বের দক্ষ ও অর্ধ-দক্ষ কর্মীদের বিশ্বস্ত নিয়োগকর্তা এবং সঠিক আন্তর্জাতিক চাকরির সুযোগের সঙ্গে সংযুক্ত করে।",
    "footer.company": "কোম্পানি", "footer.services": "সেবা", "footer.getstarted": "শুরু করুন",
    "footer.rights": "সর্বস্বত্ব সংরক্ষিত।",

    "apply.title": "কাজের আবেদন", "apply.sub": "এই ফর্ম পূরণ করুন, আমাদের দল উপযুক্ত কাজের জন্য যোগাযোগ করবে।",
    "f.name": "পুরো নাম", "f.phone": "ফোন নম্বর", "f.trade": "আপনার ট্রেড / দক্ষতা",
    "f.exp": "অভিজ্ঞতার বছর", "f.location": "আপনার শহর", "f.message": "আর কিছু? (ঐচ্ছিক)",
    "f.selectTrade": "আপনার ট্রেড নির্বাচন করুন", "f.selectExp": "অভিজ্ঞতা নির্বাচন করুন",
    "apply.submit": "আবেদন জমা দিন",
    "apply.okT": "আবেদন গৃহীত!", "apply.okP": "ধন্যবাদ। আমাদের দল শীঘ্রই ফোন বা WhatsApp-এ যোগাযোগ করবে।",

    "hire.title": "দক্ষ কর্মী নিয়োগ করুন", "hire.sub": "আপনার প্রয়োজন জানান — আমরা উপলব্ধ কর্মী নিয়ে সাড়া দেব।",
    "f.company": "কোম্পানি / আপনার নাম", "f.contact": "যোগাযোগের ব্যক্তি", "f.tradeNeed": "যে ট্রেড প্রয়োজন",
    "f.count": "কতজন কর্মী?", "f.locNeed": "কাজের স্থান / শহর", "f.gender": "লিঙ্গ", "f.detail": "প্রয়োজনের বিবরণ (ঐচ্ছিক)",
    "hire.submit": "অনুরোধ পাঠান",
    "hire.okT": "অনুরোধ গৃহীত!", "hire.okP": "ধন্যবাদ। আমাদের দল শীঘ্রই যোগাযোগ করবে।",

    "loc.title": "আমরা যেখানে কাজ করি", "loc.sub": "কর্মী উপলব্ধতা যাচাই করতে আপনার শহর খুঁজুন।",
    "loc.search": "আপনার শহর বা এলাকা খুঁজুন...",
    "loc.available": "উপলব্ধ", "loc.empty": "কোনো অবস্থান পাওয়া যায়নি। আমরা বাড়ছি — আপনার এলাকার জন্য যোগাযোগ করুন।",

    "err.required": "এই ঘরটি আবশ্যক", "err.phone": "সঠিক ফোন নম্বর দিন",
  },

  ta: {
    "brand.tag": "மனிதவள தீர்வுகள்",
    "nav.home": "முகப்பு", "nav.services": "சேவைகள்", "nav.locations": "இடங்கள்",
    "nav.apply": "வேலைக்கு விண்ணப்பம்", "nav.hire": "தொழிலாளர் தேவை", "nav.contact": "தொடர்பு", "nav.admin": "நிர்வாகம்",

    "hero.badge": "நம்பகமான தொழிலாளர் வழங்குநர்",
    "hero.title1": "திறமையான தொழிலாளர்கள்,", "hero.title2": "தேவைக்கேற்ப வழங்கப்படும்",
    "hero.lead": "Go Hire Consultancy சரிபார்க்கப்பட்ட பொறியாளர்கள், பிளம்பர்கள், மின்சார தொழிலாளர்கள், வெல்டர்கள் மற்றும் பலரை அவர்கள் தேவைப்படும் நிறுவனங்களுடன் இணைக்கிறது — வேகமாக, நம்பகமாக, சிக்கலின்றி.",
    "hero.cta1": "வேலைக்கு விண்ணப்பம்", "hero.cta2": "தொழிலாளர் தேவையா?",
    "hero.stat1": "சரிபார்க்கப்பட்ட தொழிலாளர்", "hero.stat2": "தொழில் வகைகள்", "hero.stat3": "நகரங்கள்",
    "hero.card": "தேவையான தொழில்கள்", "hero.avail": "கிடைக்கிறது",

    "trust.1": "ID சரிபார்க்கப்பட்டது", "trust.2": "அன்றே பதில்", "trust.3": "அனைத்து தொழில்", "trust.4": "இந்தியா முழுவதும்",

    "services.eyebrow": "நாங்கள் வழங்குவது",
    "services.title": "ஒவ்வொரு தொழிலும், ஒரு நம்பகமான கூட்டாளர்",
    "services.sub": "திறமையான பொறியாளர் முதல் தள தொழிலாளர் வரை — சரியான வேலைக்கு சரியான ஆட்கள்.",
    "services.go": "இந்த தொழில் வேண்டும்",

    "why.eyebrow": "ஏன் Go Hire Consultancy",
    "why.title": "வேகம், நம்பிக்கை, வளர்ச்சிக்காக உருவாக்கப்பட்டது",
    "why.1t": "சரிபார்க்கப்பட்ட & திறமையான", "why.1p": "ஒவ்வொரு தொழிலாளரும் சரிபார்க்கப்பட்டு திறன் உறுதி செய்யப்பட்ட பின்பே பட்டியலிடப்படுகிறார்.",
    "why.2t": "விரைவான சேவை", "why.2p": "உங்கள் தேவையை சொல்லுங்கள் — அன்றே கிடைக்கும் தொழிலாளர்களுடன் பதிலளிக்கிறோம்.",
    "why.3t": "அனைத்து தொழில்", "why.3p": "பொறியாளர், பிளம்பர், மின்சாரம், வெல்டர், கொத்தனார், உதவியாளர் மற்றும் பல.",
    "why.4t": "பரந்த கவரேஜ்", "why.4p": "பல நகரங்களில் கிடைக்கிறது, ஒவ்வொரு மாதமும் விரிவடைகிறது.",

    "split.worker.t": "வேலை தேடுகிறீர்களா?", "split.worker.p": "2 நிமிடத்தில் பதிவு செய்யுங்கள். பொருத்தம் இருந்தால் எங்கள் குழு தொடர்பு கொள்ளும்.",
    "split.worker.b": "தொழிலாளராக விண்ணப்பம்",
    "split.employer.t": "திறமையான தொழிலாளர் தேவையா?", "split.employer.p": "உங்கள் தேவை மற்றும் இடத்தை சொல்லுங்கள். விரைவில் தொழிலாளர் பெறுங்கள்.",
    "split.employer.b": "தொழிலாளர் கோரிக்கை",

    "how.eyebrow": "எளிய செயல்முறை", "how.title": "இது எப்படி வேலை செய்கிறது",
    "how.1t": "உங்கள் விவரம் கொடுங்கள்", "how.1p": "ஒரு சிறிய படிவம் நிரப்புங்கள் — தொழிலாளர் அல்லது நிறுவனமாக.",
    "how.2t": "நாங்கள் பொருத்துகிறோம்", "how.2p": "எங்கள் குழு உங்கள் கோரிக்கையைப் பார்த்து சரியான ஆட்களை கண்டறியும்.",
    "how.3t": "நாங்கள் இணைக்கிறோம்", "how.3p": "தொலைபேசி அல்லது WhatsApp-இல் நேரடியாக அழைத்து இறுதி செய்கிறோம்.",

    "contact.title": "தொடங்க தயாரா?",
    "contact.sub": "அழையுங்கள் அல்லது WhatsApp-இல் செய்தி அனுப்புங்கள் — சில மணிநேரத்தில் பதிலளிக்கிறோம்.",
    "contact.call": "இப்போது அழைக்கவும்", "contact.whatsapp": "WhatsApp செய்யுங்கள்",

    "footer.about": "Go Hire Consultancy உலகம் முழுவதும் உள்ள திறமையான மற்றும் அரைத் திறமையான தொழிலாளர்களை நம்பகமான நிறுவனங்கள் மற்றும் சரியான சர்வதேச வேலை வாய்ப்புகளுடன் இணைக்கிறது.",
    "footer.company": "நிறுவனம்", "footer.services": "சேவைகள்", "footer.getstarted": "தொடங்குங்கள்",
    "footer.rights": "அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.",

    "apply.title": "வேலைக்கு விண்ணப்பம்", "apply.sub": "இந்த படிவத்தை நிரப்புங்கள், எங்கள் குழு பொருத்தமான வேலைக்கு தொடர்பு கொள்ளும்.",
    "f.name": "முழு பெயர்", "f.phone": "தொலைபேசி எண்", "f.trade": "உங்கள் தொழில் / திறன்",
    "f.exp": "அனுபவ ஆண்டுகள்", "f.location": "உங்கள் நகரம்", "f.message": "வேறு ஏதேனும்? (விருப்பம்)",
    "f.selectTrade": "உங்கள் தொழிலை தேர்ந்தெடுக்கவும்", "f.selectExp": "அனுபவத்தை தேர்ந்தெடுக்கவும்",
    "apply.submit": "விண்ணப்பத்தை சமர்ப்பிக்கவும்",
    "apply.okT": "விண்ணப்பம் பெறப்பட்டது!", "apply.okP": "நன்றி. எங்கள் குழு விரைவில் தொலைபேசி அல்லது WhatsApp-இல் தொடர்பு கொள்ளும்.",

    "hire.title": "திறமையான தொழிலாளர்களை நியமிக்கவும்", "hire.sub": "உங்கள் தேவையை சொல்லுங்கள் — கிடைக்கும் தொழிலாளர்களுடன் பதிலளிப்போம்.",
    "f.company": "நிறுவனம் / உங்கள் பெயர்", "f.contact": "தொடர்பு நபர்", "f.tradeNeed": "தேவையான தொழில்",
    "f.count": "எத்தனை தொழிலாளர்?", "f.locNeed": "வேலை இடம் / நகரம்", "f.gender": "பாலினம்", "f.detail": "தேவை விவரம் (விருப்பம்)",
    "hire.submit": "கோரிக்கை அனுப்பு",
    "hire.okT": "கோரிக்கை பெறப்பட்டது!", "hire.okP": "நன்றி. எங்கள் குழு விரைவில் தொடர்பு கொள்ளும்.",

    "loc.title": "நாங்கள் இயங்கும் இடங்கள்", "loc.sub": "தொழிலாளர் கிடைப்பை சரிபார்க்க உங்கள் நகரத்தை தேடுங்கள்.",
    "loc.search": "உங்கள் நகரம் அல்லது பகுதியை தேடுங்கள்...",
    "loc.available": "கிடைக்கிறது", "loc.empty": "இடம் எதுவும் இல்லை. நாங்கள் விரிவடைகிறோம் — உங்கள் பகுதிக்கு தொடர்பு கொள்ளுங்கள்.",

    "err.required": "இந்த புலம் தேவை", "err.phone": "சரியான தொலைபேசி எண்ணை உள்ளிடவும்",
  },

  te: {
    "brand.tag": "మ్యాన్‌పవర్ పరిష్కారాలు",
    "nav.home": "హోమ్", "nav.services": "సేవలు", "nav.locations": "స్థానాలు",
    "nav.apply": "పనికి దరఖాస్తు", "nav.hire": "కార్మికులు కావాలి", "nav.contact": "సంప్రదించండి", "nav.admin": "అడ్మిన్",

    "hero.badge": "నమ్మదగిన కార్మిక సరఫరాదారు",
    "hero.title1": "నైపుణ్యం గల కార్మికులు,", "hero.title2": "అవసరమైనప్పుడు అందిస్తాం",
    "hero.lead": "Go Hire Consultancy ధృవీకరించబడిన ఇంజనీర్లు, ప్లంబర్లు, ఎలక్ట్రీషియన్లు, వెల్డర్లు మరియు మరిన్నింటిని వారు అవసరమైన కంపెనీలతో కలుపుతుంది — వేగంగా, నమ్మకంగా, ఇబ్బంది లేకుండా.",
    "hero.cta1": "పనికి దరఖాస్తు", "hero.cta2": "కార్మికులు కావాలా?",
    "hero.stat1": "ధృవీకరించిన కార్మికులు", "hero.stat2": "ట్రేడ్ విభాగాలు", "hero.stat3": "నగరాలు",
    "hero.card": "డిమాండ్ ఉన్న ట్రేడ్‌లు", "hero.avail": "అందుబాటులో",

    "trust.1": "ID ధృవీకరించిన కార్మికులు", "trust.2": "అదే రోజు స్పందన", "trust.3": "అన్ని ట్రేడ్‌లు", "trust.4": "భారతదేశం అంతటా",

    "services.eyebrow": "మేము అందించేది",
    "services.title": "ప్రతి ట్రేడ్, ఒక నమ్మకమైన భాగస్వామి",
    "services.sub": "నైపుణ్యం గల ఇంజనీర్ నుండి సైట్ కార్మికుల వరకు — సరైన పనికి సరైన వ్యక్తులు.",
    "services.go": "ఈ ట్రేడ్ కావాలి",

    "why.eyebrow": "ఎందుకు Go Hire Consultancy",
    "why.title": "వేగం, నమ్మకం, విస్తరణ కోసం నిర్మించబడింది",
    "why.1t": "ధృవీకరించిన & నైపుణ్యం", "why.1p": "ప్రతి కార్మికుడిని పరిశీలించి నైపుణ్యం నిర్ధారించిన తర్వాతే జాబితా చేస్తాం.",
    "why.2t": "వేగవంతమైన సేవ", "why.2p": "మీ అవసరం చెప్పండి — అదే రోజు అందుబాటులో ఉన్న కార్మికులతో స్పందిస్తాం.",
    "why.3t": "అన్ని ట్రేడ్‌లు", "why.3p": "ఇంజనీర్లు, ప్లంబర్లు, ఎలక్ట్రీషియన్లు, వెల్డర్లు, మేస్త్రీలు, హెల్పర్లు మరియు మరిన్ని.",
    "why.4t": "విస్తృత కవరేజ్", "why.4p": "అనేక నగరాల్లో అందుబాటులో, ప్రతి నెలా విస్తరిస్తోంది.",

    "split.worker.t": "పని వెతుకుతున్నారా?", "split.worker.p": "2 నిమిషాల్లో నమోదు చేయండి. సరిపోలితే మా బృందం సంప్రదిస్తుంది.",
    "split.worker.b": "కార్మికుడిగా దరఖాస్తు",
    "split.employer.t": "నైపుణ్యం గల కార్మికులు కావాలా?", "split.employer.p": "మీ అవసరం, స్థానం చెప్పండి. త్వరగా కార్మికులను పొందండి.",
    "split.employer.b": "కార్మికుల అభ్యర్థన",

    "how.eyebrow": "సులభమైన ప్రక్రియ", "how.title": "ఇది ఎలా పనిచేస్తుంది",
    "how.1t": "మీ వివరాలు ఇవ్వండి", "how.1p": "ఒక చిన్న ఫారం నింపండి — కార్మికుడిగా లేదా యజమానిగా.",
    "how.2t": "మేము సరిపోల్చుతాం", "how.2p": "మా బృందం మీ అభ్యర్థనను చూసి సరైన వ్యక్తులను కనుగొంటుంది.",
    "how.3t": "మేము కలుపుతాం", "how.3p": "ఫోన్ లేదా WhatsApp లో నేరుగా కాల్ చేసి అన్నీ ఖరారు చేస్తాం.",

    "contact.title": "ప్రారంభించడానికి సిద్ధమా?",
    "contact.sub": "కాల్ చేయండి లేదా WhatsApp లో సందేశం పంపండి — కొన్ని గంటల్లో స్పందిస్తాం.",
    "contact.call": "ఇప్పుడు కాల్ చేయండి", "contact.whatsapp": "WhatsApp చేయండి",

    "footer.about": "Go Hire Consultancy ప్రపంచవ్యాప్తంగా ఉన్న నైపుణ్యం కలిగిన మరియు అర్ధ-నైపుణ్యం కలిగిన కార్మికులను విశ్వసనీయమైన సంస్థలు మరియు సరైన అంతర్జాతీయ ఉద్యోగ అవకాశాలతో అనుసంధానిస్తుంది.",
    "footer.company": "కంపెనీ", "footer.services": "సేవలు", "footer.getstarted": "ప్రారంభించండి",
    "footer.rights": "అన్ని హక్కులు రిజర్వ్డ్.",

    "apply.title": "పనికి దరఖాస్తు", "apply.sub": "ఈ ఫారం నింపండి, మా బృందం తగిన పని కోసం సంప్రదిస్తుంది.",
    "f.name": "పూర్తి పేరు", "f.phone": "ఫోన్ నంబర్", "f.trade": "మీ ట్రేడ్ / నైపుణ్యం",
    "f.exp": "అనుభవ సంవత్సరాలు", "f.location": "మీ నగరం", "f.message": "మరేదైనా? (ఐచ్ఛికం)",
    "f.selectTrade": "మీ ట్రేడ్ ఎంచుకోండి", "f.selectExp": "అనుభవం ఎంచుకోండి",
    "apply.submit": "దరఖాస్తు సమర్పించండి",
    "apply.okT": "దరఖాస్తు అందింది!", "apply.okP": "ధన్యవాదాలు. మా బృందం త్వరలో ఫోన్ లేదా WhatsApp లో సంప్రదిస్తుంది.",

    "hire.title": "నైపుణ్యం గల కార్మికులను నియమించండి", "hire.sub": "మీ అవసరం చెప్పండి — అందుబాటులో ఉన్న కార్మికులతో స్పందిస్తాం.",
    "f.company": "కంపెనీ / మీ పేరు", "f.contact": "సంప్రదింపు వ్యక్తి", "f.tradeNeed": "అవసరమైన ట్రేడ్",
    "f.count": "ఎంత మంది కార్మికులు?", "f.locNeed": "పని స్థలం / నగరం", "f.gender": "లింగం", "f.detail": "అవసర వివరాలు (ఐచ్ఛికం)",
    "hire.submit": "అభ్యర్థన పంపండి",
    "hire.okT": "అభ్యర్థన అందింది!", "hire.okP": "ధన్యవాదాలు. మా బృందం త్వరలో సంప్రదిస్తుంది.",

    "loc.title": "మేము పనిచేసే ప్రాంతాలు", "loc.sub": "కార్మికుల లభ్యతను తనిఖీ చేయడానికి మీ నగరాన్ని వెతకండి.",
    "loc.search": "మీ నగరం లేదా ప్రాంతాన్ని వెతకండి...",
    "loc.available": "అందుబాటులో", "loc.empty": "స్థానం కనబడలేదు. మేము విస్తరిస్తున్నాం — మీ ప్రాంతం కోసం సంప్రదించండి.",

    "err.required": "ఈ ఫీల్డ్ అవసరం", "err.phone": "సరైన ఫోన్ నంబర్ ఇవ్వండి",
  },

  mr: {
    "brand.tag": "मनुष्यबळ उपाय",
    "nav.home": "मुख्यपृष्ठ", "nav.services": "सेवा", "nav.locations": "ठिकाणे",
    "nav.apply": "कामासाठी अर्ज", "nav.hire": "कामगार हवे", "nav.contact": "संपर्क", "nav.admin": "अ‍ॅडमिन",

    "hero.badge": "विश्वासार्ह ब्लू-कॉलर मनुष्यबळ पुरवठादार",
    "hero.title1": "कुशल कामगार,", "hero.title2": "गरजेनुसार उपलब्ध",
    "hero.lead": "Go Hire Consultancy सत्यापित अभियंते, प्लंबर, इलेक्ट्रिशियन, वेल्डर आणि इतरांना त्यांची गरज असलेल्या कंपन्यांशी जोडते — जलद, विश्वासार्ह आणि त्रासमुक्त.",
    "hero.cta1": "कामासाठी अर्ज", "hero.cta2": "कामगार हवे?",
    "hero.stat1": "सत्यापित कामगार", "hero.stat2": "ट्रेड श्रेणी", "hero.stat3": "शहरे",
    "hero.card": "मागणी असलेले ट्रेड", "hero.avail": "उपलब्ध",

    "trust.1": "ID सत्यापित कामगार", "trust.2": "त्याच दिवशी प्रतिसाद", "trust.3": "सर्व ट्रेड", "trust.4": "संपूर्ण भारत",

    "services.eyebrow": "आम्ही काय पुरवतो",
    "services.title": "प्रत्येक ट्रेड, एक विश्वासार्ह भागीदार",
    "services.sub": "कुशल अभियंत्यापासून साइट कामगारांपर्यंत — योग्य कामासाठी योग्य माणसे.",
    "services.go": "हा ट्रेड हवा",

    "why.eyebrow": "Go Hire Consultancy का",
    "why.title": "वेग, विश्वास आणि विस्तारासाठी बनवलेले",
    "why.1t": "सत्यापित व कुशल", "why.1p": "प्रत्येक कामगाराची तपासणी व कौशल्य पुष्टी केल्यानंतरच यादीत समाविष्ट केले जाते.",
    "why.2t": "जलद सेवा", "why.2p": "तुमची गरज सांगा — त्याच दिवशी उपलब्ध कामगारांसह प्रतिसाद देतो.",
    "why.3t": "सर्व ट्रेड", "why.3p": "अभियंते, प्लंबर, इलेक्ट्रिशियन, वेल्डर, गवंडी, मदतनीस आणि बरेच काही.",
    "why.4t": "विस्तृत व्याप्ती", "why.4p": "अनेक शहरांमध्ये उपलब्ध, दर महिन्याला वाढत आहे.",

    "split.worker.t": "काम शोधत आहात?", "split.worker.p": "2 मिनिटांत नोंदणी करा. जुळल्यास आमची टीम संपर्क करेल.",
    "split.worker.b": "कामगार म्हणून अर्ज",
    "split.employer.t": "कुशल कामगार हवेत?", "split.employer.p": "तुमची गरज व ठिकाण सांगा. लवकर कामगार मिळवा.",
    "split.employer.b": "कामगारांची मागणी",

    "how.eyebrow": "सोपी प्रक्रिया", "how.title": "हे कसे कार्य करते",
    "how.1t": "तुमची माहिती द्या", "how.1p": "एक छोटा फॉर्म भरा — कामगार किंवा नियोक्ता म्हणून.",
    "how.2t": "आम्ही जुळवतो", "how.2p": "आमची टीम तुमची विनंती पाहून योग्य माणसे किंवा कामे शोधते.",
    "how.3t": "आम्ही जोडतो", "how.3p": "फोन किंवा WhatsApp वर थेट कॉल करून सर्व निश्चित करतो.",

    "contact.title": "सुरू करण्यास तयार?",
    "contact.sub": "कॉल करा किंवा WhatsApp वर संदेश पाठवा — आम्ही काही तासांत उत्तर देतो.",
    "contact.call": "आता कॉल करा", "contact.whatsapp": "WhatsApp करा",

    "footer.about": "Go Hire Consultancy जगभरातील कुशल आणि अर्ध-कुशल कामगारांना विश्वासार्ह नियोक्ते आणि योग्य आंतरराष्ट्रीय नोकरीच्या संधींशी जोडते.",
    "footer.company": "कंपनी", "footer.services": "सेवा", "footer.getstarted": "सुरू करा",
    "footer.rights": "सर्व हक्क राखीव.",

    "apply.title": "कामासाठी अर्ज", "apply.sub": "हा फॉर्म भरा, आमची टीम योग्य कामासाठी संपर्क करेल.",
    "f.name": "पूर्ण नाव", "f.phone": "फोन नंबर", "f.trade": "तुमचा ट्रेड / कौशल्य",
    "f.exp": "अनुभवाची वर्षे", "f.location": "तुमचे शहर", "f.message": "आणखी काही? (ऐच्छिक)",
    "f.selectTrade": "तुमचा ट्रेड निवडा", "f.selectExp": "अनुभव निवडा",
    "apply.submit": "अर्ज सबमिट करा",
    "apply.okT": "अर्ज मिळाला!", "apply.okP": "धन्यवाद. आमची टीम लवकरच फोन किंवा WhatsApp वर संपर्क करेल.",

    "hire.title": "कुशल कामगार नियुक्त करा", "hire.sub": "तुमची गरज सांगा — आम्ही उपलब्ध कामगारांसह प्रतिसाद देऊ.",
    "f.company": "कंपनी / तुमचे नाव", "f.contact": "संपर्क व्यक्ती", "f.tradeNeed": "आवश्यक ट्रेड",
    "f.count": "किती कामगार?", "f.locNeed": "कामाचे ठिकाण / शहर", "f.gender": "लिंग", "f.detail": "गरजेचा तपशील (ऐच्छिक)",
    "hire.submit": "विनंती पाठवा",
    "hire.okT": "विनंती मिळाली!", "hire.okP": "धन्यवाद. आमची टीम लवकरच संपर्क करेल.",

    "loc.title": "आम्ही कुठे कार्यरत आहोत", "loc.sub": "कामगार उपलब्धता तपासण्यासाठी तुमचे शहर शोधा.",
    "loc.search": "तुमचे शहर किंवा परिसर शोधा...",
    "loc.available": "उपलब्ध", "loc.empty": "कोणतेही ठिकाण सापडले नाही. आम्ही विस्तारत आहोत — तुमच्या परिसरासाठी संपर्क करा.",

    "err.required": "हे क्षेत्र आवश्यक आहे", "err.phone": "वैध फोन नंबर टाका",
  },
};
