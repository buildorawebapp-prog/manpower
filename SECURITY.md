# 🔒 SECURITY GUIDE - Go Hire Consultancy

## ✅ Current Security Status

Your website is **production-ready** for GitHub public deployment. All sensitive data is properly handled.

---

## 🛡️ What's Protected

### 1. **Supabase Keys** ✅
- **Anon Key**: Safe to expose in browser (protected by Row Level Security)
- **Service Role Key**: NEVER put this in frontend code
- Keys can be rotated from Supabase dashboard if needed

### 2. **Environment Variables** ✅
- `.env` file is in `.gitignore` (never commits to GitHub)
- `.env.example` provides template without real credentials
- `config.js` loads from environment variables in production

### 3. **Password Security** ✅
- All passwords are hashed with SHA-256
- Stored in `user_passwords` table with RLS policies
- Authentication via Supabase RPC functions

---

## 🚀 Deployment Steps

### **Step 1: Push to GitHub**
```bash
git init
git add .
git commit -m "Initial commit - Go Hire Consultancy"
git branch -M main
git remote add origin https://github.com/yourusername/gohire.git
git push -u origin main
```

### **Step 2: Deploy to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. **Configure Environment Variables** in Vercel dashboard:
   - Go to: Project Settings → Environment Variables
   - Add these:
     ```
     SUPABASE_URL = https://srbudwxaxqfddwmwhobw.supabase.co
     SUPABASE_ANON_KEY = eyJhbGc...your-key-here
     ```
5. Deploy!

### **Step 3: Add Custom Domain**
1. In Vercel: Project Settings → Domains
2. Add your custom domain (e.g., `gohireconsultancy.com`)
3. Update DNS records as shown by Vercel
4. SSL certificate auto-generated ✅

---

## 📋 Files Protected

| File | Status | Notes |
|------|--------|-------|
| `.env` | ✅ Ignored | Local secrets only |
| `.env.example` | ✅ Safe | Template, no real data |
| `js/config.js` | ✅ Safe | Uses env variables |
| `js/supabase.js` | ✅ Safe | Anon key only (public-safe) |
| `supabase/*.sql` | ✅ Safe | Schema only, no credentials |

---

## 🔐 What NOT to Commit

**NEVER** commit these to GitHub:
- `.env` files with real credentials
- Service role keys
- Database passwords
- Payment gateway secrets (Razorpay secret key)
- Admin passwords
- Private API keys

---

## ⚙️ Vercel Environment Variables

Set these in Vercel dashboard (Settings → Environment Variables):

### **Required:**
```bash
SUPABASE_URL=https://srbudwxaxqfddwmwhobw.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYnVkd3hheHFmZGR3bXdob2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjMzNDIsImV4cCI6MjA5OTkzOTM0Mn0.3io-O10VVafEv3Xe2qbNs0sP3c9gMy-b4g5QqCYpm7c
```

### **Optional (for future payment integration):**
```bash
RAZORPAY_KEY_ID=rzp_live_your_key_here
RAZORPAY_KEY_SECRET=your_secret_here
```

---

## 🔄 If Keys Are Compromised

### **Supabase Keys:**
1. Go to: Supabase Dashboard → Settings → API
2. Click "Regenerate" on the compromised key
3. Update `.env` locally
4. Update Vercel environment variables
5. Redeploy

### **Database Passwords:**
1. Change in Supabase Dashboard → Settings → Database
2. Update RLS policies if needed
3. No frontend changes required (users don't access DB directly)

---

## 🧪 Testing Security

### **Check #1: Search codebase for leaked secrets**
```bash
# Run in project folder
grep -r "service_role" .
grep -r "sk_live" .
grep -r "rzp_live" .
```
Should return **no results** in committed files.

### **Check #2: Verify .gitignore**
```bash
git status
```
Should NOT show `.env` or any sensitive files.

### **Check #3: Test RLS policies**
- Try accessing data without login → Should fail
- Try modifying another user's data → Should fail
- Admin access should work only when authenticated

---

## 📝 Best Practices

✅ **DO:**
- Use environment variables for all secrets
- Enable Row Level Security (RLS) on all tables
- Use HTTPS (auto-enabled by Vercel)
- Rotate keys periodically
- Monitor Supabase logs for suspicious activity

❌ **DON'T:**
- Commit `.env` files
- Expose service_role key in frontend
- Store passwords in plain text
- Use same password for all services
- Disable RLS policies

---

## 🆘 Emergency Response

If you accidentally commit sensitive data:

### **Option 1: Remove from last commit**
```bash
git reset --soft HEAD~1
# Remove sensitive files
git add .
git commit -m "Fix: Remove sensitive data"
git push --force
```

### **Option 2: BFG Repo Cleaner (nuclear option)**
```bash
# Download BFG from: https://rtyley.github.io/bfg-repo-cleaner/
java -jar bfg.jar --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force
```

### **Option 3: Regenerate all keys**
- Rotate ALL exposed credentials immediately
- Update Vercel environment variables
- Force logout all users (clear sessions in Supabase)

---

## ✅ Security Checklist

Before going live:

- [ ] `.gitignore` includes `.env`
- [ ] `.env.example` has no real credentials
- [ ] Vercel environment variables configured
- [ ] Supabase RLS policies enabled
- [ ] Admin dashboard requires authentication
- [ ] No hardcoded passwords in code
- [ ] HTTPS enabled (auto on Vercel)
- [ ] Custom domain configured
- [ ] Database backups enabled (Supabase auto-backup)
- [ ] Monitoring enabled (Supabase dashboard)

---

## 📞 Support

**Supabase Issues:** [https://supabase.com/docs](https://supabase.com/docs)  
**Vercel Issues:** [https://vercel.com/docs](https://vercel.com/docs)  
**Security Questions:** Check Supabase RLS documentation

---

**Status:** ✅ **SECURE & READY FOR DEPLOYMENT**

All sensitive data is properly protected. Safe to push to GitHub public repository.
