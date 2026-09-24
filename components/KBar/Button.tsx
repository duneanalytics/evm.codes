import { useEffect, useState } from 'react'

import { useKBar } from 'kbar'

import { isMac } from 'util/browser'

import { Button, Icon } from 'components/ui'

const KBarButton = () => {
  const { query } = useKBar()
  // Read the platform after mount so the server and first client render match.
  const [showMacShortcut, setShowMacShortcut] = useState(false)

  useEffect(() => setShowMacShortcut(isMac), [])

  return (
    <Button
      size="xs"
      onClick={query.toggle}
      className="mx-4 py-1 px-2 font-medium"
      transparent
      outline
      padded={false}
    >
      {showMacShortcut && <Icon name="command-line" className="mr-1" />}
      {showMacShortcut ? <span>K</span> : <span>Ctrl + K</span>}
    </Button>
  )
}

export default KBarButton
