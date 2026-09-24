import React, { createContext, useEffect, useState } from 'react'

const LOCAL_SETTINGS_KEY = 'evmcodes_settings'

type ContextProps = {
  getSetting: (key: string) => any
  setSetting: (key: string, value: any) => void
  settings: any
  settingsLoaded: boolean
}

export enum Setting {
  EditorCodeType = 'editor::codetype',
  VmChain = 'vm::chain',
  VmFork = 'vm::fork',
}

export const SettingsContext = createContext<ContextProps>({
  settings: {},
  settingsLoaded: false,

  getSetting: () => null,
  setSetting: () => null,
})

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [settings, setSettings] = useState<any>({})
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const getSetting = (key: string) => {
    return settings[key]
  }

  const setSetting = (key: string, value: any) => {
    const newSettings = {
      ...settings,
      [key]: value,
    }

    localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(newSettings))
    setSettings(newSettings)
  }

  useEffect(() => {
    const current = localStorage.getItem(LOCAL_SETTINGS_KEY)
    setSettings(current ? JSON.parse(current) : {})
    setSettingsLoaded(true)
  }, [])

  return (
    <SettingsContext.Provider
      value={{
        settings,
        settingsLoaded,

        getSetting,
        setSetting,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}
