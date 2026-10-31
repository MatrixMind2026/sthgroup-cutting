@echo off
chcp 65001 >nul
echo Сборка установщика STHGroup Cutting
where node >nul 2>nul || (echo Установите Node.js 20+ с nodejs.org и запустите снова & pause & exit /b 1)
call npm install || (echo Ошибка npm install & pause & exit /b 1)
call npm run dist || (echo Ошибка сборки & pause & exit /b 1)
echo Готово: папка dist
explorer dist
pause
