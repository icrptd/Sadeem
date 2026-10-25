@echo off
setlocal
cd /d "%~dp0"
echo [1/3] Preparing environment...
if not exist .venv\Scripts\python.exe python -m venv .venv
if errorlevel 1 goto err
.venv\Scripts\python.exe -m pip install -q -r requirements.txt
if errorlevel 1 goto err
echo [2/3] Building with PyInstaller...
.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --windowed --name Sadeem --icon icon.ico --add-data "ui;ui" sadeem.py
if errorlevel 1 goto err
rmdir /s /q build 2>nul
del /q Sadeem.spec 2>nul
echo [3/3] Done.
echo.
echo RUN THIS FILE:  dist\Sadeem\Sadeem.exe
echo (Do not use anything inside the build folder.)
echo To make an installer open installer.iss in Inno Setup and press Compile.
pause
exit /b 0
:err
echo Build failed.
pause
exit /b 1
