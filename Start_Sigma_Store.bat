@echo off
chcp 65001 > nul
title Sigma Store - نظام إدارة المخزون والخدمات
cd /d "%~dp0"
echo ====================================================
echo    جاري تشغيل نظام Sigma Store على المنفذ 4000...
echo    المتجر والموقع: http://localhost:4000/shop
echo ====================================================
start "" npm start