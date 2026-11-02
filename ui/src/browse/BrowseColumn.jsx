import PropTypes from 'prop-types'
import { useTranslate } from 'react-admin'
import {
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import clsx from 'clsx'

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    // Without these the pane grows to fit its rows and the list never scrolls: a flex item's
    // default min size is its content
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    borderRight: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderRight: 'none',
    },
  },
  header: {
    flexShrink: 0,
    padding: theme.spacing(0.75, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    background: theme.palette.action.hover,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 0,
  },
  item: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  selected: {
    backgroundColor: theme.palette.action.selected,
    fontWeight: 'bold',
  },
  itemText: {
    margin: 0,
    '& span': {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    },
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: theme.spacing(2),
  },
}))

/**
 * One pane of the browser: a header and a single-selection list, with an "All" row on top that
 * clears the narrowing for that pane (null is "All").
 */
const BrowseColumn = ({
  title,
  items,
  selected,
  onSelect,
  loading,
  getLabel = (item) => item.name,
}) => {
  const classes = useStyles()
  const translate = useTranslate()

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" color="textSecondary">
          {items.length}
        </Typography>
      </div>
      {loading ? (
        <div className={classes.loading}>
          <CircularProgress size={20} />
        </div>
      ) : (
        <List dense className={classes.list}>
          <ListItem
            button
            className={clsx(
              classes.item,
              selected === null && classes.selected,
            )}
            onClick={() => onSelect(null)}
          >
            <ListItemText
              className={classes.itemText}
              primary={translate('browse.all', { _: 'All' })}
            />
          </ListItem>
          {items.map((item) => (
            <ListItem
              button
              key={item.id}
              className={clsx(
                classes.item,
                selected === item.id && classes.selected,
              )}
              onClick={() => onSelect(item.id)}
            >
              <ListItemText
                className={classes.itemText}
                primary={getLabel(item)}
              />
            </ListItem>
          ))}
        </List>
      )}
    </div>
  )
}

BrowseColumn.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.array.isRequired,
  selected: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  getLabel: PropTypes.func,
}

export default BrowseColumn
