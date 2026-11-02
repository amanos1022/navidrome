import { useCallback, useEffect, useRef, useState } from 'react'
import { MenuItemLink, useTranslate } from 'react-admin'
import AlbumIcon from '@material-ui/icons/Album'
import MicIcon from '@material-ui/icons/Mic'
import MenuList from '@material-ui/core/MenuList'
import Paper from '@material-ui/core/Paper'
import Popper from '@material-ui/core/Popper'
import { makeStyles } from '@material-ui/core/styles'

const useStyles = makeStyles(
  (theme) => ({
    popper: {
      zIndex: theme.zIndex.drawer + 1,
    },
    paper: {
      // The flyout items are their own links, so they get the default padding back
      '& a': {
        paddingLeft: theme.spacing(2),
      },
    },
  }),
  { name: 'NDRandomMenuItem' },
)

// Small delay so the pointer can travel from the menu item to the flyout, which is rendered in a
// portal and therefore not a DOM child of the item it belongs to.
const CLOSE_DELAY_MS = 200

/**
 * The "Random" entry of the album list menu, with a flyout offering random albums or random
 * artists. Clicking the entry itself keeps the original behaviour (random albums).
 */
const RandomMenuItem = ({
  to,
  primaryText,
  leftIcon,
  activeClassName,
  sidebarIsOpen,
  dense,
}) => {
  const classes = useStyles()
  const translate = useTranslate()
  const [anchorEl, setAnchorEl] = useState(null)
  const closeTimeout = useRef()

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimeout.current)
  }, [])

  const open = useCallback(
    (event) => {
      cancelClose()
      setAnchorEl(event.currentTarget)
    },
    [cancelClose],
  )

  const close = useCallback(() => {
    cancelClose()
    closeTimeout.current = setTimeout(() => setAnchorEl(null), CLOSE_DELAY_MS)
  }, [cancelClose])

  const closeNow = useCallback(() => {
    cancelClose()
    setAnchorEl(null)
  }, [cancelClose])

  useEffect(() => cancelClose, [cancelClose])

  return (
    <div onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
      <MenuItemLink
        to={to}
        primaryText={primaryText}
        leftIcon={leftIcon}
        activeClassName={activeClassName}
        sidebarIsOpen={sidebarIsOpen}
        dense={dense}
        onClick={closeNow}
        exact
      />
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="right-start"
        className={classes.popper}
      >
        <Paper
          className={classes.paper}
          onMouseEnter={cancelClose}
          onMouseLeave={close}
        >
          <MenuList dense={dense} disablePadding>
            <MenuItemLink
              to={to}
              primaryText={translate('resources.album.name', {
                smart_count: 2,
              })}
              leftIcon={<AlbumIcon />}
              activeClassName={activeClassName}
              sidebarIsOpen
              dense={dense}
              onClick={closeNow}
              exact
            />
            <MenuItemLink
              to="/artist/random"
              primaryText={translate('resources.artist.name', {
                smart_count: 2,
              })}
              leftIcon={<MicIcon />}
              activeClassName={activeClassName}
              sidebarIsOpen
              dense={dense}
              onClick={closeNow}
              exact
            />
          </MenuList>
        </Paper>
      </Popper>
    </div>
  )
}

export default RandomMenuItem
