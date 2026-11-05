@echo off
title CASCO 3D - Gestao de pedidos
cd /d "%~dp0"
if exist "..\node-win.exe" (
  "..\node-win.exe" server.mjs
) else if exist "..\node.exe" (
  "..\node.exe" server.mjs
) else (
  node server.mjs
)
pause
