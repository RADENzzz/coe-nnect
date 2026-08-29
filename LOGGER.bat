@echo off
setlocal enabledelayedexpansion

:: ============================================
:: SCRIPT INFORMATION
:: ============================================
:: Author: Alrhaden Javier
:: Version: 4.1
:: Description: File and Folder Log Generator
:: ============================================

:: ============================================
:: GET DATE AND TIME
:: ============================================
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do set "datetime=%%I"

if not defined datetime (
    for /f "tokens=1-6 delims=/: " %%a in ("%date% %time%") do (
        set "datetime=%%c%%b%%a%%d%%e%%f"
    )
)

set "logdate=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%"
set "loghour=%datetime:~8,2%"
set "logminute=%datetime:~10,2%"

:: Remove leading zeros from hour
set "hour24=%loghour%"
if "%hour24:~0,1%"=="0" set "hour24=%hour24:~1%"

:: Convert to 12-hour format
set "ampm=AM"
if %hour24% geq 12 set "ampm=PM"
set /a hour12=%hour24%
if %hour24% gtr 12 set /a hour12=%hour24%-12
if %hour24% equ 0 set hour12=12

:: Create date folder
set "datefolder=logs\%logdate%"
if not exist "%datefolder%" mkdir "%datefolder%" 2>nul

:: ============================================
:: CLEAR SCREEN AND SHOW HEADER
:: ============================================
cls
echo ========================================
echo        FILE LOG GENERATOR v4.1
echo        by Alrhaden Javier
echo ========================================
echo.
echo Date: %date%
echo Time: %time:~0,8%
echo Directory: %cd%
echo.
echo ========================================
echo.

:: ============================================
:: GET COMMIT INFORMATION
:: ============================================
echo Enter commit information:
echo.
set /p commit_number="Commit Number (e.g., #123): "
set /p num_contributors="How many contributors? "

if "%num_contributors%"=="" set num_contributors=1
if %num_contributors% lss 1 set num_contributors=1

:: Get contributor names
set contributor_count=0
set contributor_list=

echo.
echo Enter contributor names:
echo.

:get_contributors
set /a contributor_count+=1
set /p contributor_name="Contributor !contributor_count! name: "
set "contributor_list=!contributor_list! !contributor_name!"

if !contributor_count! lss %num_contributors% goto get_contributors

:: Display contributors
echo.
echo ========================================
echo Contributors for this commit:
echo ========================================
set counter=0
for %%c in (!contributor_list!) do (
    set /a counter+=1
    echo   !counter!. %%c
)
echo.

:: Get current user
echo.
echo Enter your name (will be recorded inside the log):
set /p current_user="Your name: "

:: Create log filename
set "logfile=%datefolder%\%hour12%.%logminute%%ampm%.txt"
if exist "%logfile%" (
    set "logfile=%datefolder%\%hour12%.%logminute%%ampm%_%random%.txt"
)

:: ============================================
:: GENERATE LOG FILE
:: ============================================
echo.
echo Generating log file...
echo.

:: Create the log file with header
(
    echo ========================================
    echo FILE AND FOLDER LOG
    echo Generated on: %date% %time%
    echo Directory: %cd%
    echo Logged by: %current_user%
    echo ========================================
    echo.
    echo === COMMIT INFORMATION ===
    echo Commit Number: %commit_number%
    echo Number of Contributors: %num_contributors%
    echo Contributors:
) > "%logfile%"

:: Add contributor list
set counter=0
for %%c in (!contributor_list!) do (
    set /a counter+=1
    echo   !counter!. %%c >> "%logfile%"
)

:: Add folders section
echo. >> "%logfile%"
echo === DIRECTORY STRUCTURE (All Folders) === >> "%logfile%"
echo. >> "%logfile%"

set foldercount=0
for /d /r %%i in (*) do (
    set "folder=%%i"
    set "folder=!folder:%cd%\=!"
    
    set "exclude=0"
    echo !folder! | findstr /i "\.git" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "logs" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "node_modules" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "build" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "dist" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "\.next" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "coverage" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "\.vscode" > nul 2>&1 && set "exclude=1"
    echo !folder! | findstr /i "\.idea" > nul 2>&1 && set "exclude=1"
    
    if !exclude!==0 (
        echo [FOLDER] !folder! >> "%logfile%"
        set /a foldercount+=1
    )
)

:: Add files section
echo. >> "%logfile%"
echo === ALL FILES (Including Subfolders) === >> "%logfile%"
echo. >> "%logfile%"

set filecount=0

for /r %%i in (*) do (
    set "file=%%i"
    set "file=!file:%cd%\=!"
    
    set "exclude=0"
    echo !file! | findstr /i "\.git" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "logs" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "node_modules" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\build\\" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\dist\\" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.next\\" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.log$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.lock$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "package-lock\\.json$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "yarn\\.lock$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.map$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.min\\.js$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.min\\.css$" > nul 2>&1 && set "exclude=1"
    echo !file! | findstr /i "\\.env$" > nul 2>&1 && set "exclude=1"
    if /i "!file!"=="%~nx0" set "exclude=1"
    
    if !exclude!==0 (
        echo [FILE] !file! >> "%logfile%"
        set /a filecount+=1
    )
)

:: Add summary
echo. >> "%logfile%"
echo === SUMMARY === >> "%logfile%"
echo Total Folders: %foldercount% >> "%logfile%"
echo Total Files: %filecount% >> "%logfile%"
echo ======================================== >> "%logfile%"

:: ============================================
:: COMPLETION MESSAGE
:: ============================================
cls
echo ========================================
echo        LOG FILE CREATED SUCCESSFULLY!
echo ========================================
echo.
echo Location: %logfile%
echo Commit: %commit_number%
echo Logged by: %current_user%
echo Contributors: %num_contributors%
set counter=0
for %%c in (!contributor_list!) do (
    set /a counter+=1
    echo   !counter!. %%c
)
echo.
echo Files logged: %filecount%
echo Folders logged: %foldercount%
echo.
echo ========================================
echo Press any key to view the log file...
pause > nul
start "" "%logfile%"