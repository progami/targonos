on run argv
    if (count of argv) is 0 then error "Missing action."

    set actionName to item 1 of argv as text

    if actionName is "ensure-tab" then
        if (count of argv) is less than 3 then error "ensure-tab requires target URL and host list."
        return my ensureTab(item 2 of argv as text, item 3 of argv as text)
    else if actionName is "open-window" then
        if (count of argv) is less than 2 then error "open-window requires target URL."
        return my openWindow(item 2 of argv as text)
    else if actionName is "open-tab" then
        if (count of argv) is less than 2 then error "open-tab requires target URL."
        return my openTab(item 2 of argv as text)
    else if actionName is "navigate-tab" then
        if (count of argv) is less than 2 then error "navigate-tab requires target URL."
        my navigateActiveTab(item 2 of argv as text)
        return "OK"
    else if actionName is "wait-tab" then
        return my waitForDocument()
    else if actionName is "run-js" then
        if (count of argv) is less than 2 then error "run-js requires JS code."
        return my runJavaScript(item 2 of argv as text)
    else if actionName is "get-url" then
        return my getActiveTabUrl()
    else
        error "Unknown action: " & actionName
    end if
end run

on ensureChromeRunning()
    tell application "Google Chrome"
        activate

        repeat until running
            delay 0.2
        end repeat

        if (count of windows) is 0 then
            make new window
            delay 0.5
        end if
    end tell
end ensureChromeRunning

on ensureTab(targetURL, hostListText)
    set hostList to my parseHosts(hostListText)
    my ensureChromeRunning()

    tell application "Google Chrome"
        repeat with windowIndex from 1 to (count of windows)
            set currentWindow to window windowIndex
            repeat with tabIndex from 1 to (count of tabs of currentWindow)
                set currentTab to tab tabIndex of currentWindow
                set tabURL to ""
                try
                    set tabURL to URL of currentTab as text
                end try

                if my matchesAnyHost(tabURL, hostList) then
                    activate
                    set active tab index of currentWindow to tabIndex
                    set index of currentWindow to 1
                    delay 0.2
                    return URL of active tab of front window as text
                end if
            end repeat
        end repeat
    end tell

    return my openTab(targetURL)
end ensureTab

on openTab(targetURL)
    my ensureChromeRunning()

    tell application "Google Chrome"
        activate
        tell front window
            make new tab with properties {URL:targetURL}
            set active tab index to (count of tabs)
        end tell
    end tell

    return targetURL
end openTab

on openWindow(targetURL)
    my ensureChromeRunning()

    tell application "Google Chrome"
        activate
        make new window
        delay 0.3
        set URL of active tab of front window to targetURL
        delay 0.2
        return URL of active tab of front window as text
    end tell
end openWindow

on navigateActiveTab(targetURL)
    my ensureChromeRunning()

    tell application "Google Chrome"
        set URL of active tab of front window to targetURL
    end tell
end navigateActiveTab

on waitForDocument()
    repeat 240 times
        try
            set readyState to my runJavaScript("document.readyState")
            if readyState is "complete" or readyState is "interactive" then
                return readyState
            end if
        end try
        delay 0.25
    end repeat

    return "timeout"
end waitForDocument

on runJavaScript(jsCode)
    my ensureChromeRunning()

    tell application "Google Chrome"
        set resultValue to execute active tab of front window javascript jsCode
    end tell

    if resultValue is missing value then return ""
    return resultValue as text
end runJavaScript

on getActiveTabUrl()
    my ensureChromeRunning()

    tell application "Google Chrome"
        try
            return URL of active tab of front window as text
        on error
            return ""
        end try
    end tell
end getActiveTabUrl

on parseHosts(hostListText)
    if hostListText is "" then return {}
    set savedDelimiters to AppleScript's text item delimiters
    set AppleScript's text item delimiters to ","
    set parts to text items of hostListText
    set AppleScript's text item delimiters to savedDelimiters
    return parts
end parseHosts

on matchesAnyHost(sourceURL, hostList)
    repeat with hostText in hostList
        if my urlMatchesHost(sourceURL, hostText as text) then return true
    end repeat
    return false
end matchesAnyHost

on urlMatchesHost(sourceURL, hostText)
    if sourceURL is missing value then return false
    if sourceURL is "" then return false
    if hostText is "" then return false
    return (sourceURL starts with ("https://" & hostText & "/")) or (sourceURL is ("https://" & hostText)) or (sourceURL starts with ("http://" & hostText & "/")) or (sourceURL is ("http://" & hostText))
end urlMatchesHost
