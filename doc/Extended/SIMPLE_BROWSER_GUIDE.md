# 🖥️ Simple Browser Guide - View Dashboard in Cursor

## What is Simple Browser?

Cursor's **Simple Browser** is an integrated browser that lets you view web pages directly inside Cursor without leaving your IDE. Perfect for viewing your dashboard while coding!

---

## 🚀 **Quick Start**

### Step 1: Start the Dashboard

```bash
cd mvp
npm run dashboard
```

**Expected Output:**
```
🎯 XlochaGOS Dashboard running at http://localhost:3001
📊 View your data at: http://localhost:3001
🔄 Server is running... Press Ctrl+C to stop
```

### Step 2: Open Simple Browser in Cursor

**Method 1: Command Palette** (Recommended)
1. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. Type: `Simple Browser: Show`
3. Press Enter

**Method 2: Keyboard Shortcut**
- Press `Ctrl+K` then `Ctrl+B` (may vary by Cursor version)

### Step 3: Enter Dashboard URL

Once Simple Browser opens:
1. In the address bar, type: `http://localhost:3001`
2. Press Enter
3. ✅ Your dashboard loads directly in Cursor!

---

## ✨ **Benefits of Simple Browser**

### ✅ **Advantages:**
- **No tab switching** - Stay in Cursor while viewing dashboard
- **Quick access** - Open/close instantly without leaving IDE
- **Integrated workflow** - View dashboard while coding
- **Fast navigation** - Use Cursor shortcuts and commands
- **Clean workspace** - All your tools in one place

### 📋 **Perfect For:**
- Quick dashboard checks while coding
- Testing dashboard changes without alt-tabbing
- Viewing generated content and images
- Approving/rejecting posts while working on code
- Monitoring system status during development

---

## 🎯 **Workflow Example**

### Typical Development Session:

1. **Start Dashboard in Terminal:**
   ```bash
   npm run dashboard
   ```

2. **Open Simple Browser in Cursor:**
   - `Ctrl+Shift+P` → "Simple Browser: Show"
   - Enter: `http://localhost:3001`

3. **Work on Code:**
   - Edit dashboard files
   - Make changes
   - Simple Browser auto-refreshes (or press F5)

4. **Review Content:**
   - Check generated posts
   - View images
   - Approve/reject posts
   - Copy image URLs

5. **Everything in One Place:**
   - ✅ Code editor open
   - ✅ Dashboard visible
   - ✅ Terminal running
   - ✅ No tab switching needed!

---

## 🔧 **Troubleshooting**

### Simple Browser Not Opening?

1. **Check Cursor Version:**
   - Simple Browser may require latest Cursor update
   - Update Cursor if needed

2. **Alternative Method:**
   - If Command Palette doesn't work, try:
   - `View` → `Simple Browser` (menu bar)
   - Or check Cursor settings for keyboard shortcuts

3. **Dashboard Not Loading?**
   ```bash
   # Verify dashboard is running
   # Should see: "🎯 XlochaGOS Dashboard running at http://localhost:3001"
   
   # If port is in use:
   # Change port in .env: DASHBOARD_PORT=3002
   ```

### Still Having Issues?

**Fallback: Use External Browser**
- Just open http://localhost:3001 in Chrome/Firefox
- Works exactly the same, just outside Cursor

---

## 📝 **Tips & Tricks**

### **Keyboard Shortcuts:**
- `F5` - Refresh Simple Browser
- `Ctrl+W` / `Cmd+W` - Close Simple Browser
- `Ctrl+Shift+P` - Open Command Palette anytime

### **Multiple Views:**
- Open Simple Browser in a split view
- View dashboard and code side-by-side
- Drag Simple Browser tab to split pane

### **Quick Access:**
- Keep dashboard URL bookmarked in Simple Browser
- Or save it as a snippet for quick entry

---

## 🎉 **Enjoy Your Integrated Workflow!**

Now you can:
- ✅ View dashboard while coding
- ✅ Test changes instantly
- ✅ Review content without alt-tabbing
- ✅ Stay focused in one environment

**Happy coding!** 🚀

