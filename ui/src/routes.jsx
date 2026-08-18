import React from 'react'
import { Route } from 'react-router-dom'
import Personal from './personal/Personal'
import FileBrowser from './filebrowser/FileBrowser'

const routes = [
  <Route exact path="/personal" render={() => <Personal />} key={'personal'} />,
  <Route exact path="/files" render={() => <FileBrowser />} key={'files'} />,
  <Route
    exact
    path="/files/:folderId"
    render={() => <FileBrowser />}
    key={'files-folder'}
  />,
]

export default routes
