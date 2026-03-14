on run argv
    if (count of argv) is 0 then error "Missing action."

    set actionName to item 1 of argv as text

    if actionName is "ensure-tab" then
        if (count of argv) is less than 3 then error "ensure-tab requires target URL and host list."
        return my ensureTab(item 2 of argv as text, item 3 of argv as text)
    else if actionName is "focus-tab" then
        if (count of argv) is less than 3 then error "focus-tab requires window id and tab index."
        my focusTab((item 2 of argv) as integer, (item 3 of argv) as integer)
        return "OK"
    else if actionName is "open-tab" then
        if (count of argv) is less than 2 then error "open-tab requires target URL."
        return my openTab(item 2 of argv as text)
    else if actionName is "navigate-tab" then
        if (count of argv) is less than 4 then error "navigate-tab requires window id, tab index, and target URL."
        my navigateTab((item 2 of argv) as integer, (item 3 of argv) as integer, item 4 of argv as text)
        return "OK"
    else if actionName is "wait-tab" then
        if (count of argv) is less than 3 then error "wait-tab requires window id and tab index."
        return my waitForDocument((item 2 of argv) as integer, (item 3 of argv) as integer)
    else if actionName is "run-js" then
        if (count of argv) is less than 4 then error "run-js requires window id, tab index, and JS code."
        return my runJavaScript((item 2 of argv) as integer, (item 3 of argv) as integer, item 4 of argv as text)
    else if actionName is "get-url" then
        if (count of argv) is less than 3 then error "get-url requires window id and tab index."
        return my getTabUrl((item 2 of argv) as integer, (item 3 of argv) as integer)
    else
        error "Unknown action: " & actionName
    end if
end run

on ensureTab(targetURL, hostListText)
    set hostList to my parseHosts(hostListText)

    tell application "Safari"
        activate

        repeat until running
            delay 0.2
        end repeat

        repeat with currentWindow in windows
            set windowId to id of currentWindow
            repeat with tabIndex from 1 to (count of tabs of currentWindow)
                set currentTab to tab tabIndex of currentWindow
                set tabURL to ""
                try
                    set tabURL to URL of currentTab as text
                end try

                if my matchesAnyHost(tabURL, hostList) then
                    set current tab of window id windowId to currentTab
                    return (windowId as text) & "|" & (tabIndex as text) & "|" & tabURL
                end if
            end repeat
        end repeat

        if (count of windows) is 0 then
            make new document with properties {URL:targetURL}
            delay 1
            return (id of front window as text) & "|1|" & targetURL
        end if

        tell front window
            set newTab to make new tab with properties {URL:targetURL}
            set current tab to newTab
            return (id as text) & "|" & (index of newTab as text) & "|" & targetURL
        end tell
    end tell
end ensureTab

on openTab(targetURL)
    tell application "Safari"
        activate

        repeat until running
            delay 0.2
        end repeat

        if (count of windows) is 0 then
            make new document with properties {URL:targetURL}
            delay 1
            return (id of front window as text) & "|1|" & targetURL
        end if

        tell front window
            set newTab to make new tab with properties {URL:targetURL}
            set current tab to newTab
            return (id as text) & "|" & (index of newTab as text) & "|" & targetURL
        end tell
    end tell
end openTab

on focusTab(windowId, tabIndex)
    tell application "Safari"
        activate
        set current tab of window id windowId to tab tabIndex of window id windowId
    end tell
end focusTab

on navigateTab(windowId, tabIndex, targetURL)
    tell application "Safari"
        set URL of tab tabIndex of window id windowId to targetURL
    end tell
end navigateTab

on waitForDocument(windowId, tabIndex)
    repeat 160 times
        try
            set readyState to my runJavaScript(windowId, tabIndex, "document.readyState")
            if readyState is "complete" or readyState is "interactive" then
                return readyState
            end if
        end try
        delay 0.25
    end repeat
    return "timeout"
end waitForDocument

on runJavaScript(windowId, tabIndex, jsCode)
    tell application "Safari"
        set resultValue to do JavaScript jsCode in tab tabIndex of window id windowId
    end tell

    if resultValue is missing value then return ""
    return resultValue as text
end runJavaScript

on getTabUrl(windowId, tabIndex)
    tell application "Safari"
        try
            return URL of tab tabIndex of window id windowId as text
        on error
            return ""
        end try
    end tell
end getTabUrl

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
