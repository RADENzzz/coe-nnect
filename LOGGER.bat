@echo off
setlocal enabledelayedexpansion

:: Create logs folder if it doesn't exist
if not exist "logs" mkdir logs

:: Get date and time
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "datetime=%%I"
set "logdate=%datetime:~0,4%-%datetime:~4,2%-%datetime:~6,2%"
set "logtime=%datetime:~8,2%-%datetime:~10,2%-%datetime:~12,2%"
set "logfile=logs\file_log_%logdate%_%logtime%.txt"

:: Clear screen
cls
echo ========================================
echo        FILE LOG GENERATOR
echo ========================================
echo.

:: Get commit information from user
echo Enter commit information:
echo.
set /p commit_number="Commit Number (e.g., #123): "
set /p num_contributors="How many contributors? "

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

:: Display the contributors
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

:: Header for the log file
echo ======================================== > "%logfile%"
echo FILE AND FOLDER LOG >> "%logfile%"
echo Generated on: %date% %time% >> "%logfile%"
echo Directory: %cd% >> "%logfile%"
echo ======================================== >> "%logfile%"
echo. >> "%logfile%"

:: Commit information
echo === COMMIT INFORMATION === >> "%logfile%"
echo Commit Number: %commit_number% >> "%logfile%"
echo Number of Contributors: %num_contributors% >> "%logfile%"
echo Contributors: >> "%logfile%"
set counter=0
for %%c in (!contributor_list!) do (
    set /a counter+=1
    echo   !counter!. %%c >> "%logfile%"
)
echo. >> "%logfile%"

:: Log all folders
echo === FOLDERS === >> "%logfile%"
for /d %%i in (*) do (
    if /i not "%%i"==".git" (
        echo [FOLDER] %%i >> "%logfile%"
    )
)

echo. >> "%logfile%"

:: Log all files
echo === FILES === >> "%logfile%"
for %%i in (*) do (
    echo [FILE] %%i >> "%logfile%"
)

echo. >> "%logfile%"

:: Log file count and folder count
echo === SUMMARY === >> "%logfile%"
set /a filecount=0
set /a foldercount=0

for /d %%i in (*) do (
    if /i not "%%i"==".git" (
        set /a foldercount+=1
    )
)

for %%i in (*) do (
    if /i not "%%i"=="%~nx0" (
        set /a filecount+=1
    )
)

echo Total Folders: !foldercount! >> "%logfile%"
echo Total Files: !filecount! >> "%logfile%"
echo ======================================== >> "%logfile%"

:: Display completion message
echo.
echo ========================================
echo Log file created successfully!
echo Location: %logfile%
echo ========================================
echo.
echo Commit: %commit_number%
echo Contributors: !num_contributors!
set counter=0
for %%c in (!contributor_list!) do (
    set /a counter+=1
    echo   !counter!. %%c
)
echo.
echo Press any key to view the log file...
pause > nul
start "" "%logfile%"