'use babel'

$ = jQuery = require('jquery')

import { CompositeDisposable, Emitter, TextEditor } from 'atom'

import TeSSLaController from './tessla-controller.js'
import TeSSLaMessagePanel from './tessla-message-panel.js'
import TeSSLaSidebar from './tessla-sidebar.js'
import TeSSLaProject from './tessla-project.js'
import TeSSLaViewManager from './tessla-view-manager.js'

import sf from 'scan-folder'
import * as dependencies from 'atom-package-deps'
import childProcess from 'child_process'

// The subscriptions object will handle atom global commands while the emitter is an project internal
// object for emitting and listening to events.
let subscriptions   = null
let emitter         = null

// Some variables handling the tool bar state
let toolBar         = null
let toolBarButtons  = {}

// These variables are all additional GUI copmonents and its managers
let messagePanel    = null
let sidebar         = null
let tableView       = null

// A controller handleing all events inside this package
let controller      = null

// A flag showing if all the components were toggled
let toggled         = true

// An object containing information about the active project in Atom
let activeProject   = null

// A notification manager object
let viewMgr         = null

export function activate(state) {
  // first of all install all dependencies
  dependencies.install('tessla').then(() => {
    // console.log("All dependencies installed we're good to go")

    // here we will start a new docker tessla container
    var startDocker = childProcess.spawn('docker', [
      'run', '-tid', '--name', 'tessla', 'tessla', 'sh'
    ])

    // const notification = atom.notifications.addInfo(`Setting up TeSSLa`, {
    //   detail: `Starting Docker container`
    // })

    // if the docker container is started go on with setup
    startDocker.on('close', () => {

      // dismiss open notification
      //notification.dismiss()

      // Construct a project object containing the active project in the view
      activeProject = new TeSSLaProject()
      // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
      subscriptions = new CompositeDisposable()
      // A project global emitter to emit and listen to events
      emitter       = new Emitter()
      //emitter.on('created-message-panel', showStartupNotification)
      // create a notification manager object
      viewMgr       = new TeSSLaViewManager(emitter)
      // Create a controller object
      controller    = new TeSSLaController(emitter, activeProject, viewMgr)
      // Create the message panel
      messagePanel  = new TeSSLaMessagePanel(emitter)
      // Create the functions sidebar
      sidebar       = new TeSSLaSidebar(emitter)

      // Register command that toggles this view
      subscriptions.add(atom.commands.add('atom-workspace', {
        'tessla:toggle':                    () => toggle(),
        'tessla:set-up-split-view':         () => emitter.emit('set-up-split-view'),
        'tessla:toggle-message-panel':      () => emitter.emit('toggle-message-panel'),
        'tessla:build-and-run-c-code':      () => emitter.emit('compile-and-run-c-code'),
        'tessla:build-c-code':              () => emitter.emit('build-c-code', false),
        'tessla:run-c-code':                () => emitter.emit('run-c-code', {}),
        'tessla:stop-current-process':      () => emitter.emit('stop-current-process'),
        'tessla:build-and-run-project':     () => emitter.emit('compile-and-run-project'),
        'tessla:toggle-sidebar':            () => emitter.emit('toggle-sidebar'),
        'tessla:set-up-split-view':         () => emitter.emit('set-up-split-view', false)
      }));

      // emit event when file was saved
      atom.workspace.observeTextEditors((editor) => {
        editor.onDidSave((event) => {
          // emit save event
          emitter.emit('file-saved', event.path)
        })

        editor.onDidChangeCursorPosition((event) => {
          // emit chane event
          emitter.emit('cursor-changed-in-file', event)
        })

        editor.onDidStopChanging((event) => {
          // emit stop changing event
          emitter.emit('stop-changing-text-editor-content', event)
        })
      })

      // emit event when file was changed
      atom.workspace.onDidStopChangingActivePaneItem((item) => {
        // emit change event
        if (atom.workspace.isTextEditor(item)) {
          emitter.emit('file-changed', item.getPath())
        } else {
          emitter.emit('no-open-file', null)
        }
      })

      // emit update functions sidebar when a new text editor is created
      atom.workspace.onDidAddTextEditor((event) => {
        emitter.emit('added-text-editor-to-workspace', event.textEditor.getPath())
      })

      // distribute tool bar buttons to all subscribers and try to set up the split view
      emitter.emit('distribute-tool-bar-buttons', toolBarButtons)
      emitter.emit('set-up-split-view', true)
    })

  }).catch((error) => {
    console.log(error)
    atom.notifications.addError("Could not start TeSSLa package", {
      detail: "Package dependencies could not be installed. The package was not started because the TeSSLa package will not run properly without this dependencies.\n" + error.message
    })
  })
}

export function deactivate() {
  subscriptions.dispose();

  // destruct the toolbar
  if (toolBar) {
    toolBar.removeItems()
    toolBar = null
  }

  // destruct the message panel
  sidebar.destroy()

  // destruct the sidebar
  messagePanel.destroy()

  // stop and delete the docker container
  childProcess.spawn('docker', ['rm', '-f', 'tessla'])
}

export function showStartupNotification( $panel ) {
  var startupMessage = 'Make sure that you have set the correct path to the TeSSLa-server, TeSSLa-compiler, clang and InstrumentFunctions.so in the package settings pane. You also need a Java runtime environment in order to run the tessla compiler! Without these components the IDE will not run properly.'

  // show notification
  atom.notifications.addInfo('TeSSLa components', {
    detail: startupMessage
  })

  // log message into panel
  emitter.emit('add-console-text', startupMessage + '\n\n')
}

export function toggle() {
  // invert toggled
  toggled = !toggled

  // hide tool bar
  atom.config.set('tool-bar.visible', toggled)

  // hide message panel
  emitter.emit('toggle-message-panel')

  // hide functions sidebar
  emitter.emit('toggle-sidebar')
}

// add method to construct the toolBar
export function consumeToolBar(getToolBar) {
  toolBar = getToolBar('tessla')

  // adding the c-compile button
  toolBarButtons['BuildAndRunCCode'] = toolBar.addButton({
    icon:     'play-circle',
    callback: 'tessla:build-and-run-c-code',
    tooltip:  'Builds and runs C code from project directory',
    iconset:  'fa'
  })

  // adding the build button
  toolBarButtons['BuildCCode'] = toolBar.addButton({
    icon:     'gear-a',
    callback: 'tessla:build-c-code',
    tooltip:  'Builds the C code of this project into a binary',
    iconset:  'ion'
  })

  toolBarButtons['RunCCode'] = toolBar.addButton({
    icon:     'play',
    callback: 'tessla:run-c-code',
    tooltip:  'Runs the binaray compiled from C code',
    iconset:  'ion'
  })

  toolBar.addSpacer()

  // adding the complete code run button
  toolBarButtons['BuildAndRunProject'] = toolBar.addButton({
    //icon:     'bar-chart',
    icon:     'ios-circle-filled',
    callback: 'tessla:build-and-run-project',
    tooltip:  'Builds and runs C code and analizes runtime behavior',
    //iconset:  'fa'
    iconset:  'ion'
  })

  // adding a seperator
  toolBar.addSpacer()

  // adding the stop button and disable it immediatly
  toolBarButtons['Stop'] = toolBar.addButton({
    icon:     'android-checkbox-blank',
    callback: 'tessla:stop-current-process',
    tooltip:  'Stops the process that is currently running',
    iconset:  'ion'
  })
  toolBarButtons['Stop'].setEnabled(false)

  // adding a seperator
  toolBar.addSpacer()

  // adding the open console button
  toolBar.addButton({
    icon:     'terminal',
    callback: 'tessla:toggle-message-panel',
    tooltip:  'Toggles the message panel',
    iconset:  'fa'
  })

  toolBar.addButton({
    icon:     'android-menu',
    callback: 'tessla:toggle-sidebar',
    tooltip:  'Toggles the functions sidebar panel',
    iconset:  'ion'
  })

  // adding a seperator
  toolBar.addSpacer()

  toolBar.addButton({
    icon:     'columns',
    callback: 'tessla:set-up-split-view',
    tooltip:  'Set up split view',
    iconset:  'fa'
  })

  // change the tool-bar size
  atom.config.set('tool-bar.iconSize', '16px')
  atom.config.set('tool-bar.position', 'Right')
}

export const config = {
  variableValueFormatting : {
    type: "string",
    default: "variable_values:%m %d(%s) %us%n",
    order: 9,
    title: "zlog string format for variables",
    description: "This setting will format the output of variables in the trace file"
  },
  functionCallFormatting : {
    type: "string",
    default: "function_calls:%m nil %d(%s) %us%n",
    order: 10,
    title: "zlog string format for function calls",
    description: "This setting will format the output of function calls in the trace file."
  },
  animationSpeed : {
    type: "integer",
    default: 200,
    order: 11,
    title: "Animation speed",
    description: "This will set the speed of animations used in this package. The time is represented in milliseconds."
  }
}
