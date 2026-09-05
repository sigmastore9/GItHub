@echo off
chcp 65001 > nul
title رفع متجر Sigma Store إلى GitHub
cd /d "%~dp0"
echo ====================================================
echo    جاري رفع متجر Sigma Store إلى مستودع GitHub...
echo    المستودع: https://github.com/sigmastore9/GItHub.git
echo ====================================================
echo.
git push -u origin main
if %errorlevel% equ 0 (
    echo.
    echo ====================================================
    echo    ✅ تم رفع الكود إلى GitHub بنجاح تام!
    echo ====================================================
) else (
    echo.
    echo ====================================================
    echo    ⚠️ إذا طُلب منك تسجيل الدخول، اضغط Sign in with your browser
    echo ====================================================
)
pause
