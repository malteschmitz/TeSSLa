'use babel'

import * as path from 'path'
import { Range, Point } from 'atom'
import TeSSLaFileScanner from './tessla-file-scanner.js'

$ = jQuery = require('jquery')

export default class TeSSLaController {

  constructor(emitter) {
    // Store project gobal emitter in own object
    this.emitter = emitter

    // set tool-bar buttons object to null
    this.btns    = null

    // get a reference for the currently running process
    this.runningProcess = null

    // an array of markers added to the text editor
    this.tesslaMarkers              = []
    this.tesslaUnsedFunctionMarkers = []
    this.tesslaTooltipDecorations   = []

    // init instance variables
    this.projectPath = ''
    this.outputDir   = ''
    this.binaryName  = ''

    // listen to save events or tab change events
    this.onFileSavedOrAdded         = this.onFileSavedOrAdded.bind(this)
    this.onFileChanged              = this.onFileChanged.bind(this)
    this.onNoOpenFile               = this.onNoOpenFile.bind(this)
    this.onCompileAndRunCCode       = this.onCompileAndRunCCode.bind(this)
    this.onCompileAndRunProject     = this.onCompileAndRunProject.bind(this)
    this.onBuildCCode               = this.onBuildCCode.bind(this)
    this.onRunBinary                = this.onRunBinary.bind(this)
    this.onStopRunningActiveProcess = this.onStopRunningActiveProcess.bind(this)
    this.onSetUpSplitView           = this.onSetUpSplitView.bind(this)
    this.onHighlightUnusedFunctions = this.onHighlightUnusedFunctions.bind(this)
    this.onHideErrorMarkers         = this.onHideErrorMarkers.bind(this)

    this.emitter.on('file-saved',                     this.onFileSavedOrAdded)
    this.emitter.on('file-changed',                   this.onFileChanged)
    this.emitter.on('no-open-file',                   this.onNoOpenFile)
    this.emitter.on('compile-and-run-c-code',         this.onCompileAndRunCCode)
    this.emitter.on('compile-and-run-project',        this.onCompileAndRunProject)
    this.emitter.on('build-c-code',                   this.onBuildCCode)
    this.emitter.on('run-c-code',                     this.onRunBinary)
    this.emitter.on('stop-current-process',           this.onStopRunningActiveProcess)
    this.emitter.on('set-up-split-view',              this.onSetUpSplitView)
    this.emitter.on('distribute-unused-functions',    this.onHighlightUnusedFunctions)
    this.emitter.on('cursor-changed-in-file',         this.onHideErrorMarkers)
    this.emitter.on('added-text-editor-to-workspace', this.onFileSavedOrAdded)
    this.emitter.on('distribute-tool-bar-buttons',    (btns) => {
      this.btns = btns
    })
    this.emitter.on('stop-changing-text-editor-content', () => {
      // console.log('Stop changing content of editor')
      this.emitter.emit('update-sidebar', {
        projectPath:  this.projectPath,
        outputDir:    this.outputDir,
        binaryName:   this.binaryName
      })
    })
  }

  onSetUpSplitView(firstSetUp) {
    // console.log('TeSSLaController.onSetUpSplitView(firstSetUp: ' + firstSetUp + ')')

    // set fallback values
    firstSetUp = (typeof firstSetUp === 'undefined') ? false : firstSetUp

    // get open file
    var activeEditor = atom.workspace.getActiveTextEditor()
    if (activeEditor) {

      // get path from text editor
      var currentFile  = activeEditor.getPath()

      // check if untitled editor is open
      if (typeof currentFile === 'undefined') {
        // show notification that no project is currently open
        this.showNoActiveProjectForSplitViewNotification()
        // skip the rest
        return
      }

      this.projectPath = atom.project.relativizePath(currentFile)[0]
      this.outputDir   = this.projectPath + '/build'
      var subDirs      = this.projectPath.split('/')
      this.binaryName  = (subDirs[subDirs.length - 1]).replace(' ', '_')

      // now get files from this project path
      var sf        = require('scan-folder')
      var sfConfig  = {
        dotfolder: false, // no hidden folders
        dotfiles: false,  // no hidden files
        modules: false    // no module contents
      }

      var cFiles      = sf(this.projectPath, ".c", true, sfConfig)
      var tesslaFiles = sf(this.projectPath, ".tessla", true, sfConfig)

      // if there are no files then the split view can not be set up
      if (cFiles.length == 0 && tesslaFiles.length == 0) {
        this.showNotSetUpSplitViewNotification()
        return
      }

      // first get panes and destroy them
      atom.workspace.getPanes().forEach((pane) => {
        pane.destroy()
      })

      // create two panes
      atom.workspace.getPanes()[0].splitRight()

      // add files to pane
      cFiles.forEach((file) => {
        atom.workspace.open(file, {split: "left"})
      })

      tesslaFiles.forEach((file) => {
        atom.workspace.open(file, {split: "right"}).then((editor) => {
          // add a gutter to each tessla file
          editor.addGutter({
            name:     'tessla-error-gutter',
            priority: 1000,
            visible:  true
          })
        })
      })
    } else {
      // show notification that no project is currently open
      this.showNoActiveProjectForSplitViewNotification()
    }
  }

  onNoOpenFile() {
    // console.log('TeSSLaController.onNoOpenFile()')
    if ( '' != this.projectPath ) {
      // set path to empty values
      this.projectPath = ''
      this.outputDir   = ''
      this.binaryName  = ''

      // emit new
      var config = {
        projectPath:  this.projectPath,
        outputDir:    this.outputDir,
        binaryName:   this.binaryName
      }

      this.emitter.emit('active-project-changed', config)
    }
  }

  onFileSavedOrAdded(file) {
    // console.log('TeSSLaController.onFileSavedOrAdded(' + file + ')')
    // get new Project path
    var newProjectPath = atom.project.relativizePath(file)[0]

    // if the new Project path is different from the current then emit signal
    // to force subscribers to update thier path
    if ( newProjectPath != this.projectPath ) {

      // set own value
      this.projectPath = newProjectPath
      this.outputDir   = this.projectPath + '/build'
      var subDirs      = this.projectPath.split('/')
      this.binaryName  = (subDirs[subDirs.length - 1]).replace(' ', '_')

      // dispatch event that active project has changed
      var config = {
        projectPath:  this.projectPath,
        outputDir:    this.outputDir,
        binaryName:   this.binaryName
      }

      this.emitter.emit('active-project-changed', config)

      // setup project structure
      this.setUpProjectStructure()
    } else {

      // emit event that updates function sidebar
      this.emitter.emit('update-sidebar', {
        projectPath:  this.projectPath,
        outputDir:    this.outputDir,
        binaryName:   this.binaryName
      })
    }
  }

  onFileChanged(file) {
    if (typeof file === 'undefined') {
      return
    }

    // console.log('TeSSLaController.onFileChanged(' + file + ')')
    // get new Project path
    var newProjectPath = atom.project.relativizePath(file)[0]

    // if the new Project path is different from the current then emit signal
    // to force subscribers to update thier path
    if ( newProjectPath != this.projectPath ) {

      // set own value
      this.projectPath = newProjectPath
      this.outputDir   = this.projectPath + '/build'
      var subDirs      = this.projectPath.split('/')
      this.binaryName  = (subDirs[subDirs.length - 1]).replace(' ', '_')

      // and then emit to subscribers
      var config = {
        projectPath:  this.projectPath,
        outputDir:    this.outputDir,
        binaryName:   this.binaryName
      }

      this.emitter.emit('active-project-changed', config)
      this.setUpProjectStructure()
    }
  }

  onCompileAndRunCCode() {
    // skip if there is no active project!
    if ( !this.projectPath ) {
      this.showNoProjectNotification()
      return
    }

    // create build directory
    var fs = require('fs')
    if ( !fs.existsSync(this.outputDir) ) {
      fs.mkdirSync(this.outputDir);
    }

    // first save all text editors
    atom.workspace.getTextEditors().forEach((editor) => {
      editor.save()
    })

    // Then compile C code
    this.onBuildCCode({
      buildAssembly: false,
      onSuccess:     () => this.onRunBinary({})
    })
  }

  onCompileAndRunProject() {
    // skip if there is no active project!
    if ( !this.projectPath ) {
      this.showNoProjectNotification()
      return
    }

    // create build directory
    var fs = require('fs')
    if ( !fs.existsSync(this.outputDir) ) {
      // create directory
      fs.mkdirSync(this.outputDir)
    }

    // create zlog file
    // craft content of zlog file
    var formats = '[formats]\n'
    formats += 'variable_values = "' + atom.config.get('tessla.variableValueFormatting') + '"\n'
    formats += 'function_calls = "' + atom.config.get('tessla.functionCallFormatting') + '"\n'
    var rules = '[rules]\n'
    if (atom.config.get('tessla.useDocker')) {
      rules += 'variable_values_cat.DEBUG "' + 'instrumented_' + this.binaryName + '.trace"; variable_values\n'
      rules += 'function_calls_cat.DEBUG "' + 'instrumented_' + this.binaryName + '.trace"; function_calls\n'  
    } else {
      rules += 'variable_values_cat.DEBUG "' + this.outputDir + '/instrumented_' + this.binaryName + '.trace"; variable_values\n'
      rules += 'function_calls_cat.DEBUG "' + this.outputDir + '/instrumented_' + this.binaryName + '.trace"; function_calls\n'  
    }
  
    // first remove existing zlog
    if ( fs.existsSync(this.outputDir + '/zlog.conf') ) {
      fs.unlinkSync(this.outputDir + '/zlog.conf')
    }

    // then create new zlog.conf file
    fs.writeFileSync(this.outputDir + '/zlog.conf', formats + rules)

    // first save all other text editors
    var activeEditor = atom.workspace.getActiveTextEditor()
    atom.workspace.getTextEditors().forEach((editor) => {
      if (typeof editor.getPath() !== 'undefined' && editor !== activeEditor) {
        editor.save()
      }
    })

    // then save currently active text editor
    if (typeof activeEditor !== 'undefined') {
      activeEditor.save()
    }

    // start compilation process
    this.onBuildCCode({                               // First compile C code into Assembly
      onSuccess: () => this.onPatchAssembly({         // then patch Assembly
        onSuccess: () => this.onBuildAssembly({       // compile patched Assembly
          onSuccess: () => this.onRunPatchedBinary({  // run patched binary
            onSuccess: () => this.onBuildTeSSLa({     // build TeSSLa code
              onSuccess: () => this.onRunTeSSLa({
                onSuccess: (lines, time) => {
                  //console.log(startTime)
                  // emit signal that components can update with correct output values
                  this.emitter.emit('format-tessla-output', {output: lines, startTime: time})
                }
              }),  // run TeSSLa server
              onError: this.highlightTeSSLaError
            })
          })
        })
      }),
      buildAssembly: true
    })
  }

  onPatchAssembly({onSuccess, onError}) {
    // set fallback for functions that should be instrumented
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError   = (typeof onError === 'undefined') ? () => {} : onError

    if (!atom.config.get('tessla.useDocker')) {
      // get instrument functions library path
      var libInstrumentFunctions = atom.config.get('tessla.libInstrumentFunctions')
      if ( !require('fs').existsSync(libInstrumentFunctions) ) {
        this.showNoLibInstrumentFunctionsSONotification()
        return
      }
      
      // get clang path
      var clangPath = atom.config.get('tessla.clangPath').split('/')
      clangPath.pop()
      clangPath     = clangPath.join('/')
      var opt       = clangPath + '/opt'
      if ( !require('fs').existsSync(opt) ) {
        this.showNoValidOptNotification()
        return
      }
    }

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    var instrumentArgs = []
    // fetch all tessla files from project directory
    TeSSLaFileScanner.fetchCFunctionsFromTeSSLaFile({
      file: require('scan-folder')(this.projectPath, '.tessla', true, {
        dotFolder:  false,
        dotFiles:   false,
        modules:    false
      })[0],
      projectPath: this.projectPath
    }).forEach(function(value, index, array) {
      instrumentArgs.push('-instrument')
      instrumentArgs.push(value)
    })

    var args
    var command
    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla && /usr/lib/llvm-3.8/bin/opt -load /InstrumentFunctions/libInstrumentFunctions.so -instrument_function_calls build/' + this.binaryName + '.bc ' + instrumentArgs.join(' ') + ' > build/instrumented_' +  this.binaryName + '.bc'
      ]
      this.runningProcess = require('child_process').spawn(command, args)
    } else {
      command = opt
      args = [
        '-load',
        libInstrumentFunctions,
        '-instrument_function_calls',
        this.outputDir + '/' + this.binaryName + '.bc'
      ]
      args = args.concat(instrumentArgs)
      args.push('>')
      args.push(this.outputDir + '/instrumented_' + this.binaryName + '.bc')
      this.runningProcess = require('child_process').spawn(command, args, {shell: true})
    }    

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-c-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // craft command
      command += ' ' + args.map((arg) => {
        return (arg.charAt(0) != '-' && arg.charAt(0) != '>') ? '"' + arg + '"' : arg
      }).join(' ')

      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // react on output
      if (errors.length == 0) {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] Successfully patched Assembly from this project\n')

        // then show notifications
        atom.notifications.addSuccess('Successfully patched Assembly')

        // then resolve by passing back the command and a message
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] An error occurred while patching Assembly\n')

        // then show notifications
        atom.notifications.addError('Errors while patching Assembly', {detail: errors.join('')})

        // all error callback function
        onError.call(this)
      }
    })
  }

  onBuildTeSSLa({onSuccess, onError}) {
    // set fallback values
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError   = (typeof onError === 'undefined') ? () => {} : onError

    // if the compiler does not exists stop process here
    var useDocker = atom.config.get('tessla.useDocker')
    var tessla = atom.config.get('tessla.tesslaCompiler')
    if (!useDocker && !require('fs').existsSync(tessla) ) {
      this.showNoValidTeSSLaCompilerNotification()
      return
    }

    // fetch all tessla files from project directory
    var files = require('scan-folder')(this.projectPath, '.tessla', true, {
      dotFolder:  false,
      dotFiles:   false,
      modules:    false
    })

    // skip if there are no files to compile
    if (files.length == 0) {
      this.showNoCompilableTeSSLaFilesNotification()
      return
    } else if (files.length > 1) {
      this.showTooMuchCompilableTeSSLaFilesNotification()
    }

    var file = files[0]

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    let args;

    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla && java -jar /tessla-imdea-snapshot.jar ' +
          path.relative(this.projectPath, file)
      ]
    } else {
      command = 'java'
      args = [ '-jar', tessla, file ]
    } 

    // create a new process
    this.runningProcess = require('child_process').spawn(command, args)

    var outputs = []
    this.runningProcess.stdout.on('data', (data) => {
      outputs.push(data.toString())
    })

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // craft command
      command =  command + ' ' + args.map((arg) => {
        return arg.charAt(0) != '-' ? '"' + arg + '"' : arg
      }).join(' ')

      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // create strings from arrays
      var stdout = outputs.join()
      var stderr = errors.join()

      // check for compiler errors
      if (stdout.charAt(0) == '{') {
        // cut trailing comma
        //
        // Why the fuck the compiler puts an trailing , to the string?? should
        // actually be fixed in the compiler binary not in this package!!!!
        if (stdout.charAt(stdout.length - 2) == ',') {
          stdout = stdout.slice(0, -2) + '\n'
        }

        // here we know the compilation process was successful so write content to file
        require('fs').writeFileSync(this.outputDir + '/instrumented_' + this.binaryName + '.tessla.json', stdout)

        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] Successfully compiled ' + file + '\n')

        // then show notifications
        atom.notifications.addSuccess('Successfully compiled TeSSLa file')

        // remove markers from TeSSLa source code
        this.tesslaMarkers.forEach((marker) => { marker.destroy() })
        this.tesslaMarkers            = []
        this.tesslaTooltipDecorations = []

        // then resolve by passing back the command and a message
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] An error occurred while compiling ' + file + '\n')
        this.emitter.emit('add-tessla-error-text', stderr + stdout + '\n')

        // then show notifications
        atom.notifications.addError('Errors while compiling TeSSLa file', {detail: stderr + stdout})

        // run error callback
        onError.call(this, {error: stderr + stdout, file: file})
      }
    })
  }

  onBuildAssembly({onSuccess, onError}) {
    // set fallback values
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError   = (typeof onError === 'unefined') ? () => {} : onError

    if (!atom.config.get('tessla.useDocker')) {
      // if the compiler does not exists stop process here
      var clang = atom.config.get('tessla.clangPath')
      if ( !require('fs').existsSync(clang) ) {
        this.showNoValidClangNotification()
        return
      }

      // get instrument functions library path
      var libInstrumentFunctions = atom.config.get('tessla.libInstrumentFunctions')
      var libDir = libInstrumentFunctions.split('/')
      libDir.pop()
      libDir = libDir.join('/')

      if ( !require('fs').existsSync(libInstrumentFunctions) ) {
        this.showNoLibInstrumentFunctionsSONotification()
        return
      }
    }

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    var args
    var command
    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla && clang++ build/instrumented_' + this.binaryName + '.bc -o build/instrumented_' + this.binaryName +
          ' -lzlog -lpthread -L/usr/local/lib -L/InstrumentFunctions -lLogger'
      ]
    } else {
      command = clang
      args = [
        this.outputDir + '/instrumented_' + this.binaryName + '.bc',
        '-o',
        this.outputDir + '/instrumented_' + this.binaryName,
        '-lzlog',
        '-lpthread',
        '-L/usr/local/lib',
        '-L' + libDir,
        '-llogger'
      ]
    }

    // create a new process
    this.runningProcess = require('child_process').spawn(command, args)

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-c-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // craft command
      command += ' ' + args.map((arg) => {
        return arg.charAt(0) != '-' ? '"' + arg + '"' : arg
      }).join(' ')

      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // react on output
      if (errors.length == 0) {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] Successfully compiled Assembly\n')

        // then show notifications
        atom.notifications.addSuccess('Successfully compiled Assembly')

        // then resolve by passing back the command and a message
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] An error occurred while compiling Assembly\n')

        // then show notifications
        atom.notifications.addError('Errors while compiling Assembly', {detail: errors.join('')})

        // call error function
        onError.call(this)
      }
    })
  }

  /**
   * This function will fetch all C files (files ending with '.c') and build one
   * final binary from this sources.
   *
   * @return A promise resolving to sucess message or rejecting to an error message
   */
  onBuildCCode({buildAssembly, onSuccess, onError}) {
    // set fallback values
    buildAssembly = (typeof buildAssembly === 'undefined') ? false : buildAssembly
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError = (typeof onError === 'undefined') ? () => {} : onError

    // skip if there is no active project!
    if ( !this.projectPath ) {
      this.showNoProjectNotification()
      return
    }

    if (!atom.config.get('tessla.useDocker')) {
      // if the compiler does not exists stop process here
      var clang = atom.config.get('tessla.clangPath')
      if ( !require('fs').existsSync(clang) ) {
        this.showNoValidClangNotification()
        return
      }
    }

    // fetch all c files from project directory
    var files = require('scan-folder')(this.projectPath, '.c', true, {
      dotFolder:  false,
      dotFiles:   false,
      modules:    false
    })

    // skip if there are no files to compile
    if (files.length == 0) {
      this.showNoCompilableCFilesNotification()
      return
    }

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    var command
    var args
    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      var clangCommand = 'clang '
      if (buildAssembly) {
        clangCommand += '-emit-llvm -S '
      }
      clangCommand += files.map((arg) => {
        return path.relative(this.projectPath, arg)
      }).join(' ')
      clangCommand += ' -o build/' + this.binaryName
      if (buildAssembly) {
        clangCommand += '.bc'
      }
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla && ' + clangCommand
      ]
    } else {
      command = clang
      if (buildAssembly) {
        args = ['-emit-llvm', '-S']
      } else {
        args = []
      }
      args = args.concat(files)
      args.push('-o')
      args.push(this.outputDir + '/' + this.binaryName + (buildAssembly ? '.bc' : ''))
    }

    // create a new process
    this.runningProcess = require('child_process').spawn(command, args)

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-c-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // craft command
      command += ' ' + args.map((arg) => {
        return arg.charAt(0) != '-' ? '"' + arg + '"' : arg
      }).join(' ')

      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // react on output
      if (errors.length == 0) {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] Successfully compiled all C files from this project\n')

        // then show notifications
        atom.notifications.addSuccess('Successfully compiled C files')

        // we ware successful so run success callback
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] An error occurred while compiling all C files from this project\n')

        // then show notifications
        atom.notifications.addError('Errors while compiling C files', {detail: errors.join('')})

        // run error callback
        onError.call(this)
      }
    })
  }

  onRunPatchedBinary({onSuccess, onError}) {
    // set fallback values
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError = (typeof onError === 'undefined') ? () => {} : onError

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    // remove old trace file before new one would be created
    var fs        = require('fs')
    var traceFile = this.outputDir + '/instrumented_' + this.binaryName + '.trace'
    if ( fs.existsSync(traceFile) ) {
      fs.unlinkSync(traceFile)
    }

    var command
    var args
    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla/build && ./instrumented_' + this.binaryName
      ]
      this.runningProcess = require('child_process').spawn(command, args)
    } else {
      // get the binary which will be executed
      command = this.outputDir + '/instrumented_' + this.binaryName
      args = []
      // create a new process
      this.runningProcess = require('child_process').spawn(command, {cwd: this.outputDir})
    }

    // listen to streams
    var outputs = []
    this.runningProcess.stdout.on('data', (data) => {
      // log output
      this.emitter.emit('add-console-text', data.toString())
      // increase counter
      outputs.push(data.toString())
    })

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-c-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // show exit of the program
      if (code != null) {
        this.emitter.emit('add-console-text', '\nProcess exited with code ' + code + '\n\n')
      } else if (signal != null) {
        this.emitter.emit('add-console-text', '\nProcess was killed due to signal ' + signal + '\n\n')
      }

      command += ' ' + args.map((arg) => {
        return arg.charAt(0) != '-' ? '"' + arg + '"' : arg
      }).join(' ')

      // first log command
      this.emitter.emit('add-log-text', '[CMD] ' + command + '\n')

      // react on output
      if (errors.length == 0) {
        // run callback
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[MSG] An error occurred while running the patched binary\n')

        // then show notifications
        atom.notifications.addError('Errors while running the patched binary', {detail: errors.join('')})

        // run callback
        onError.call(this)
      }
    })
  }

  onRunBinary({onSuccess, onError}) {
    // set fallback values
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError   = (typeof onError === 'unefined') ? () => {} : onError

    // skip if there is no active project!
    if ( !this.projectPath ) {
      this.showNoProjectNotification()
      return
    }

    // if there is no binary stop execution process
    if ( !require('fs').existsSync(binary) ) {
      this.showNoCBinaryToExecuteNotification()
      return
    }

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()


    if (atom.config.get('tessla.useDocker')) {
      var args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla/build && ./' + this.binaryName
      ]
      this.runningProcess = require('child_process').spawn('docker', args)
    } else {
      // get the binary which will be executed
      var binary = this.outputDir + '/' + this.binaryName
      // create a new process
      this.runningProcess = require('child_process').spawn(binary)
    }

    // listen to streams
    var outputs = []
    this.runningProcess.stdout.on('data', (data) => {
      // log output
      this.emitter.emit('add-console-text', data.toString())
      // increase counter
      outputs.push(data.toString())
    })

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-c-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {
      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()

      // show exit of the program
      if (code != null) {
        this.emitter.emit('add-console-text', '\nProcess exited with code ' + code + '\n\n')
      } else if (signal != null) {
        this.emitter.emit('add-console-text', '\nProcess was killed due to singal ' + signal + '\n\n')
      }

      // react on output
      if (errors.length == 0) {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + binary + '\n')

        // call callback function
        onSuccess.call(this)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + binary + '\n[MSG] An error occurred while running the C binary from this project\n')

        // then show notifications
        atom.notifications.addError('Errors while running the C binary', {detail: errors.join('')})

        // call callback
        onError.call(this)
      }
    })
  }

  onRunTeSSLa({onSuccess, onError}) {
    // set fallback values
    onSuccess = (typeof onSuccess === 'undefined') ? () => {} : onSuccess
    onError   = (typeof onError === 'undefined') ? () => {} : onError

    // skip if there is no active project!
    if ( !this.projectPath ) {
      this.showNoProjectNotification()
      return
    }

    var fs = require('fs')

    if (!atom.config.get('tessla.useDocker')) {
      // get TeSSLa server
      var server = atom.config.get('tessla.tesslaServer')

      // if there is no binary stop execution process
      if ( !fs.existsSync(server) ) {
        this.showNoTeSSLaServerFoundNotification()
        return
      }
    }

    // get json file
    var tsslJSONs = require('scan-folder')(this.outputDir, '.tessla.json', true, {
      dotFolder:  false,
      dotFiles:   false,
      modules:    false
    })

    if (tsslJSONs.length == 0) {
      this.showNoTeSSLaJSONFoundNotification()
      return
    }

    // get the first found file
    var tsslJSON        = tsslJSONs[0]
    var JSONString      = fs.readFileSync(tsslJSON).toString()
    var tsslJSONContent = JSON.parse(JSONString).items

    var outputArgs = []
    for (var id in tsslJSONContent) {
      var stream = tsslJSONContent[id]
      if (stream.out && stream.name) {
        outputArgs.push('-o')
        outputArgs.push(stream.id + ':' + stream.name)
      }
    }

    // disable other buttons
    this.disableButtons()
    this.enableStopButton()

    // get start time
    var startTime = Date.now()

    var command
    var args
    if (atom.config.get('tessla.useDocker')) {
      command = 'docker'
      args = [
        'run',
        '--volume',
        this.projectPath + ':/tessla',
        '--rm',
        'tessla',
        'sh',
        '-c',
        'cd /tessla && LANG=C.UTF-8 /tessla_server ' +
          path.relative(this.projectPath, tsslJSON) + 
          ' --trace build/instrumented_' + this.binaryName + '.trace ' + 
          outputArgs.join(' ')
      ]
    } else {
      command = server
      var traceFile = this.outputDir + '/instrumented_' + this.binaryName + '.trace'
      args = [
        tsslJSON,
        '--trace',
        traceFile
      ]
      args = args.concat(outputArgs)
    }

    // create a new process
    this.runningProcess = require('child_process').spawn(command, args)

    // listen to streams
    var outputs = []
    this.runningProcess.stdout.on('data', (data) => {
      var dataString = data.toString()
      // log output
      this.emitter.emit('add-console-text', dataString)
      // store outputs in array
      outputs.push(dataString)
    })

    var errors = []
    this.runningProcess.stderr.on('data', (data) => {
      // log output
      this.emitter.emit('add-tessla-error-text', data.toString())
      // increase counter
      errors.push(data.toString())
    })

    // on exit react
    this.runningProcess.on('close', (code, signal) => {// craft command
      command += ' ' + args.map((arg) => {
        return arg.charAt(0) != '-' ? '"' + arg + '"' : arg
      }).join(' ')

      // delete process reference
      this.runningProcess = null

      // unlock buttons
      this.enableButtons()
      this.disableStopButton()


      // show exit of the program
      if (code != null) {
        this.emitter.emit('add-console-text', '\nProcess exited with code ' + code + '\n\n')
      } else if (signal != null) {
        this.emitter.emit('add-console-text', '\nProcess was killed due to singal ' + signal + '\n\n')
      }

      // console.log(outputs)

      // react on output
      if (errors.length == 0) {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n')

        // call callback function
        onSuccess.call(this, outputs, startTime)
      } else {
        // first log command
        this.emitter.emit('add-log-text', '[CMD] ' + command + '\n[MSG] An error occurred while running the TeSSLa server\n')

        // then show notifications
        atom.notifications.addError('Errors while running TeSSLa server', {detail: errors.join('')})

        // call callback
        onError.call(this)
      }
    })
  }

  onStopRunningActiveProcess() {
    // kill process and enable buttons
    if (this.runningProcess) {
      this.runningProcess.kill('SIGKILL')
    }
  }

  onHighlightUnusedFunctions({unusedFunctions, tesslaFile}) {
    // console.log('TeSSLaController.onHighlightUnusedFunctions()', unusedFunctions)

    // get editor that contains the tessla file
    var editors     = atom.workspace.getTextEditors()
    var editorFile  = null

    editors.forEach((editor) => {
      if (editor.getPath() == tesslaFile) {
        editorFile = editor
      }
    })

    // if the editor exists
    if (editorFile) {
      // remove current markers
      this.tesslaUnsedFunctionMarkers.forEach((marker) => {
        marker.destroy()
      })
      this.tesslaUnsedFunctionMarkers = []

      // get editor content
      var text = editorFile.getText()

      // create line counter variable
      var lineCounter = 0

      // read content line by line
      text.split('\n').forEach((line) => {

        // look for function_calls
        unusedFunctions.forEach((func) => {
          var lookupText = 'function_calls("' + func + '")'
          var idx = line.indexOf(lookupText)

          // if there were a match
          if (idx != -1) {
            // create range
            var range = new Range(
              new Point(lineCounter, idx),
              new Point(lineCounter, idx + lookupText.length)
            )

            // create marker
            var marker = editorFile.markBufferRange(range)
            this.tesslaUnsedFunctionMarkers.push(marker)

            // decorate marker
            var decoration = editorFile.decorateMarker(marker, {
              type:   'highlight',
              class:  'tessla-unused-function'
            })
          }
        })

        lineCounter++
      })
    }
  }

  highlightTeSSLaError({error, file}) {
    // first parse error
    var regex = /\b(ParserError)\(\(([\s\,0-9\-]+)\)\:\s(.*)\)/g

    // get matches
    var match = regex.exec(error)

    // if there were matches then highlight
    if (match) {
      // remove old markers
      this.tesslaMarkers.forEach((marker) => { marker.destroy() })
      this.tesslaMarkers            = []
      this.tesslaTooltipDecorations = []

      // extract information
      var type      = match[1]
      var location  = match[2]
      var text      = match[3]

      // next get editor
      atom.workspace.open(file, {
        split: 'right',
        searchAllPanes: true
      }).then((editor) => {
        // create marker
        var start   = (location.split(' - ')[0]).split(',')
        var end     = (location.split(' - ')[1]).split(',')

        start       = new Point(start[0] - 1, start[1] - 1)
        end         = new Point(  end[0] - 1,   end[1] - 1)

        // set cursor to start position
        editor.setCursorBufferPosition(start)
        editor.scrollToCursorPosition()

        // create range object and markers
        var range   = new Range(start, end)
        var marker  = editor.markBufferRange(range)

        // remember marker
        this.tesslaMarkers.push(marker)

        // next create decoration
        var decoration = editor.decorateMarker(marker, {
          type:   'highlight',
          class:  'tessla-syntax-error'
        })

        var tt      = document.createElement('div')
        var ttLabel = document.createElement('span')
        var ttText  = document.createElement('span')

        ttLabel.textContent = 'error'
        ttText.textContent  = text

        ttLabel.classList.add('error-label')
        tt.appendChild(ttLabel)
        tt.appendChild(ttText)

        var tooltip = editor.decorateMarker(marker, {
          type:     'overlay',
          class:    'tessla-syntax-tooltip',
          item:     tt,
          position: 'tail'
        })

        // remember decoration for later
        this.tesslaTooltipDecorations.push(tooltip)

        // add a gutter to the opened file
        var gutter = editor.gutterWithName('tessla-error-gutter')
        if (!gutter) {
          gutter = editor.addGutter({
            name:     'tessla-error-gutter',
            priority: 1000,
            visible:  true
          })
        }

        var gutterDot = gutter.decorateMarker(marker, {
          type:   'gutter',
          class:  'tessla-syntax-dot'
        })
      })
    }
  }

  onHideErrorMarkers(event) {
    //  skip the rest of this method if there are no markers
    if (this.tesslaMarkers.length == 0) {
      return
    }

    // destroy each marker
    this.tesslaTooltipDecorations.forEach((decoration) => {
      decoration.destroy()
    })

    // remove markers from array
    this.tesslaTooltipDecorations = []
  }

  disableButtons() {
    this.btns['BuildAndRunCCode'].setEnabled(false)
    this.btns['BuildCCode'].setEnabled(false)
    this.btns['RunCCode'].setEnabled(false)
    this.btns['BuildAndRunProject'].setEnabled(false)
  }

  enableButtons() {
    this.btns['BuildAndRunCCode'].setEnabled(true)
    this.btns['BuildCCode'].setEnabled(true)
    this.btns['RunCCode'].setEnabled(true)
    this.btns['BuildAndRunProject'].setEnabled(true)
  }

  enableStopButton() {
    this.btns['Stop'].setEnabled(true)
  }

  disableStopButton() {
    this.btns['Stop'].setEnabled(false)
  }

  showNoProjectNotification() {
    // show notification to user
    var message = 'There is no active project in your workspace. Open and activate at least one file of the project you want to compile and run in your workspace.'

    // show notification
    atom.notifications.addError('Unable to compile and run C code', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNoCompilableCFilesNotification() {
    // show notification to user
    var message = 'There are no C files to compile in this project. Create at least one C file in this project containing a main function to build a runable binary.'

    // show notification
    atom.notifications.addError('Unable to compile C files', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-c-error-text', message + '\n')
  }

  showNoCBinaryToExecuteNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'There is no C binary in the build directory which can be executed. You first have to build your C code to generate a binary.'

    // show notification
    atom.notifications.addError('Unable to run binary', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-c-error-text', message + '\n')
  }

  showNoValidClangNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'The clang compiler specified in your settings pane is not valid. The compiler does not seem to exist. Please make sure to set the correct path to your clang compiler.'

    // show notification
    atom.notifications.addError('Unable to find clang', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNoLibInstrumentFunctionsSONotification() {
    // set up a message variable containing the text shown to the user
    var message = 'The libInstrumentFunctions.so specified in your settings pane is not valid. The library does not seem to exist. Please make sure to set the correct path to your library.'

    // show notification
    atom.notifications.addError('Unable to find libInstrumentFunctions.so', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNoValidTeSSLaCompilerNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'The TeSSLa compiler specified in your settings pane is not valid. The compiler does not seem to exist. Please make sure to set the correct path to your compiler.'

    // show notification
    atom.notifications.addError('Unable to find TeSSLa compiler', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNoTeSSLaServerFoundNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'The TeSSLa server specified in your settings pane is not valid. The server does not seem to exist. Please make sure to set the correct path to your TeSSLa server.'

    // show notification
    atom.notifications.addError('Unable to find TeSSLa server', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNotSetUpSplitViewNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'There are no ".tessla" and ".c" files to put into split view in the current project. Please open at least one file of your project and activate it in workspace to properly set up the split view. The split view can be set up by right click onto your source file in the text editor and select "Set up TeSSLa split view" in the context menu.'

    // show notification
    atom.notifications.addWarning('Could not set up the split view', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-warning-text', message + '\n')
  }

  showNoTeSSLaJSONFoundNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'No TeSSLa JSON file found!'

    // show notification
    atom.notifications.addError('Unable to find TeSSLa JSON file', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  showNoActiveProjectForSplitViewNotification() {
    // set up a message variable containing the text shown to the user
    var message = 'No Project currently active. To set up the split view at least one file should be active for setting up the split view'

    // show notification
    atom.notifications.addWarning('Could not set up the split view', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-warning-text', message + '\n')
  }

  showNoValidOptNotification() {
      // set up a message variable containing the text shown to the user
    var message = 'The opt binary specified by your clang path in the settings pane is not valid. The opt binary does not seem to exist. Please make sure to set the correct path to your clang compiler.'

    // show notification
    atom.notifications.addWarning('Unable to find opt', {
      detail: message
    })

    // emit an event for inserting text into console
    this.emitter.emit('add-console-text', message + '\n')
  }

  setUpProjectStructure() {
    // console.log('TeSSLaController.setUpProjectStructure()')
    // get file system
    var fs = require('fs')

    // check if linter file already exists if yes were done here
    if ( !fs.existsSync(this.projectPath + '/.gcc-flags.json') ) {
      // spawn process
      var which = require('child_process').spawn('which', ['clang'], {
        cwd: this.projectPath,
        shell: true
      })

      // buffer out stream into data array
      var path
      which.stdout.on('data', (line) => {
        // store path
        path = line.toString()
      })

      // look into data array
      which.on('close', (code) => {
        // if there is a compiler available on the system then add a linter file
        if (path.length > 0) {
          // remove line breaks
          path = path.replace(/\r?\n|\r/g, '')

          // create file with given content
          var fileContent = ''

          fileContent += '{\n'
          fileContent += '\t"execPath": "' + path + '",\n'
          fileContent += '\t"gccDefaultCFlags": "-Wall -c -fsyntax-only",\n'
          fileContent += '\t"gccIncludePaths": ".,./include,./path",\n'
          fileContent += '\t"gccSuppressWarnings": false\n'
          fileContent += '}'

          // write content into file
          require('fs').writeFileSync(this.projectPath + '/.gcc-flags.json', fileContent)
        }
      })
    }
  }
}
