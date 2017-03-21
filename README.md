# TeSSLa-IDE Atom-package

<p align="left">
  <img src="https://img.shields.io/dub/l/vibe-d.svg" alt="License MIT">
  <img src="https://img.shields.io/badge/version-1.2.1-orange.svg" alt="Package version">
</p>

<p align="center">
  <img src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/screenshot.png?raw=true">
</p>

## Introduction

This Atom-packages provides some IDE-like functions for C-Code and the TeSSLa LTL. There are two great GUI extensions that the package provides. In Addition to the GUI components there is also a grammar file for the TeSSLa LTL provided to enable syntax highlighting for files having the `.tessla` extension. Make sure to disable other packages providing syntax highlighting for `.tessla` files to get the correct source code visualization.

## Dependencies

To use the full range of functions that are provided by this package some dependencies are needed:
- [InstrumentFunctions library](https://github.com/imdea-software/LLVM_Instrumentation_Pass)
- [TeSSLaServer](https://github.com/imdea-software/TesslaServer)

The following dependencies are installed automatically by this package:
- [[Atom] tool-bar](https://atom.io/packages/tool-bar)
- [[Atom] Linter](https://atom.io/packages/linter)
- [[Atom] linter-gcc](https://atom.io/packages/linter-gcc)

The icons that are used in this package are provided by:
- [ionicons](http://ionicons.com)
- [Font Awesome](http://fontawesome.io)


**Note:** The correct paths to the compilers and the TeSSLaServer as well as the external libraries that are listed above should be set first. The correct paths can be set in the settings pane of this package. To get to the settings pane open `Preferences > Packages > tessla > settings`. If there are missing paths some functions in some circumstances can not be used. Each value has a default fallback which is in some cases the correct path.

## Sidebar

<img align="left" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/sidebar.png?raw=true">

The sidebar is divided into two seperate areas. Each border inside this panel works as a resize handle which is also indicated by the changing cursor appearance.

The upper area shows C functions that appear in the C files and C functions that are observed from within the TeSSLa sources of the current project. Each C file that can be found recursively in the current project directory is considered when fetching function singnatures. On the other hand only the first found TeSSLa source file is used by the IDE.

Both lists providing some special functions to the user. The circled plus buttons inserting one line of TeSSLa code in the TeSSLa source file to observe the function calls in the compiled C binary. Next to the plus buttons there are _f(x)_ tags that can be colored in three different colors

When the the function tag is colored blue the function is not observed by the TeSSLa source code. When the function tag is colored green the function is observed by the TeSSLa source code and when the function tag is colored red the function is observed by the TeSSLa source code but does not seem to exist in the considered C sources.

The rightmost text in each row indicates the position where the function was found in the C sources. The format is `filename(line:character)`, where the filename is the path to the file relative to the project root.

The lower area of the sidebar contains the formatted output from the TeSSLaServer. The output is a list that contains each output identifier and the value that the identifier evaluates to at a certain time. Each output list is initially hidden and can be displayed by clicking the identifier. The entries within the list are displayed in two columns. The left column shows the time when the identifier evaluates to the value in the right column. The time format is `HH:MM:SS.mmm`. 

The border above the lower area contains a resize handle which can be used to change the space each area takes up. The whole sidebar can be resized as well as both areas inside of it. On the left edge there is a resize handle to adjust the width. The sidebar has a minimum width and a maximum width that can not be exceeded.

## Message Panel

The message panel is located beneath the text editor and logs all information and messages that are shown to the user. The different types of messages are split up into several streams each with its own reiter. The user can select which reiter should be active. Only the contents of the active reiter are displayed in the the panel body. If there were any messages that belong to an other stream the little notification badge in front of the reiter name will be incremented and colored depending on which reiter was updated. Switching the active reiter will clear the notification. The counter will be reset and the color will be set back to the original color.

At the top of the message panel there is a resize handle which can be used to adjust the height of the panel and hence the amount of visible content in the active stream. On the top right there are three buttons. The buttons can be used to interact with the message panel.
- The X button closes the message panel.
- The garbage button clears the active content in the body of the message panel.
- the write button opens a save dialog to save the content of the active stream.

Each message belongs to at least one stream:
- The `Console` stream contains all messages that were returned by the compiled C sources and the messages returned by TeSSLaServer.
- The `Errors(C)` stream contains all messages returned by the clang compiler.
- The `Errors(TeSSLa)` stream contains all messages returned by the TeSSLa compiler.
- The `warnings` stream contains all messages that were displayed as notifications. The messages refer generally to wrong user input.
- The `Log` stream contains all comands that were used by the package and the responses to these comands.

<p align="center">
  <img src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/message-panel.png?raw=true">
</p>

## Tool Bar

<img align="right" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/tool-bar.png?raw=true">

To compile and run binaries compiled from source code the tool bar provides some buttons:

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/build-and-run-c.png?raw=true"> This button compiles all C files that can be found recursively in the current project directory and runs the resulting binary. Before the binary will be created it will create a build directory within the project directory. The binary will get the same name as the project but contains `_` instead of white spaces.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/build-c.png?raw=true"> This button will do nearly the same job but without executing the resulting binary.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/run-c.png?raw=true"> Whereas this button will only runs a binary which is located in the build directory and follows the naming conventions explained above.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/build-and-run-project.png?raw=true"> This button will trigger a few more steps than just compiling and running a binary file:

1. If the build directory in the project directory is not already created it will be created.
2. All C files in the current project directory are collected recursively and an Assembly file is compiled from them. The name format of the Assembly file is `<project-name>.bc`.
3. The Assembly code is patched by appending external symbols from the instrument functions library to each observed function. The file name format is `instrumented_<project-name>.bc`.
4. The patched Assembly file is compiled into an executable binary. The binary name format is `instrumented_<project-name>`
5. A `zlog.conf` file which is needed to format the output of the instrumented binary is created in the build directory.
6. The instrumented binary is executed which generates a trace file containing information about the function calls of the observed functions. Each line in this trace file is formatted by given rules in the `zlog.conf`. The name format of the trace file is `instrumented_<project-name>.trace`.  
7. The projected directory is scanned recursively to find a TeSSLa file. The first found TeSSLa file will be taken to compile it into a JSON file containing an AST (Abstract Syntax Tree).
8. At last the AST in the JSON file and trace file are given to the TeSSLaServer which will generate the output specified in the TeSSLa file.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/stop-process.png?raw=true"> This button will stop the process that is currently running. This process can be a compilation process or a running binary.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/toggle-message-panel.png?raw=true"> This button will toggle the message panel.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/toggle-functions-sidebar.png?raw=true"> This button will toggle the sidebar.

<img align="left" width="25" src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/set-up-split-view.png?raw=true"> This button will set up the split view. To set up the split view the active file should be within a project containing TeSSLa and C files. If there is no such file the split view can not be set up.

## Menu

<p align="center">
  <img src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/menu.png?raw=true">
</p>
In the "packages" menu there is a submenu of "TeSSLa" containing some actions for this package. For each menu entry the keymap binding which are fully listed and described in the keymap bindings section are shown on the right. The entries can also be found in the tool-bar on the right side of the workspace.


## Configuration

There are some settings that are important to set before you can use all features this packages provides:
- _Path to clang compiler_: This should be the path were the clang compiler is located on your system.

 **Note:** on MacOS/OS X the clang compiler installed by Xcode/Xcode command line tools does not have the LLVM extensions. To be able to use all features provided by this package you have to build clang by your self.

- _Path to instrument functions library_: This should be the path to the `libInstrumentFunctions.so`. Further information can be found [here](https://github.com/imdea-software/LLVM_Instrumentation_Pass).

- _Path to TeSSLa compiler_: This should be the path were the TeSSLa compiler is located on your system.

- _Path to TeSSLa server_: This should be the path were the TeSSLaServer is located on your system. The TeSSLaServer and further information about it can be found [here](https://github.com/imdea-software/TesslaServer)

- _zlog string format for variables_: This represents the format of how variables are formatted in the `.trace`-files.

 **Note:** The default value will work for the TeSSLaServer linked above. Changing this value may cause problems when the TeSSLaServer is trying to interprete the `.trace` file.

- _zlog string format for function calls_: This represents the format of how function calls are formatted in the `.trace`-files.

 **Note:** The default value will work for the TeSSLaServer linked above. Changing this value may cause problems when the TeSSLaServer is trying to interprete the `.trace` file.

- _Animation speed_: This value will set the speed of animations triggered in this package. The value represents a duration milliseconds
  
<p align="center">
  <img src="https://github.com/dmlux/TeSSLa/blob/master/screenshots/settings.png?raw=true">
</p>

## Keymap bindings

The TeSSLa package provides some keymap bindings to improve the work-flow. The following list contains all provided keymap bindings and their resulting effects.

| Keymap                            | Effect                            |
|:----------------------------------|:----------------------------------|
| `cmd-shift-t`                     | Toggles the package               |
| `cmd-b`                           | This keymap causes the package to build a binary compiled from C code that was found in the active project |
| `cmd-r`                           | This keymap causes the package to build and run a binary compiled from C code that was found in the active project |
| `cmd-t`                           | This keymap causes the package to pass step 1 to 8 from the [Tool Bar section](#tool-bar) |
| `ctrl-c`                          | This keymap causes the package to stop the process currently spawned and monitored by this package |
| `cmd-enter`                       | This keymap causes the package to set up the split view. Therefore all C files of the active project are put to the left side and all TeSSLa files are put the the right side. If no files are found a notification will be displayed |

## Supported Commands

There are some global commands other packages can trigger or subscribe to. A list of all global commands and their effects are shown in the table below.

| Command                           | Description                       |
|:----------------------------------|:----------------------------------|
| `tessla:toggle`                   | This command causes the package to toggle all components of the package including sidebar and message panel |
| `tessla:set-up-split-view`        | This command causes the package to set up the split view. Therefore all C files of the active project are put to the left side and all TeSSLa files are put the the right side. If no files are found a notification will be displayed |
| `tessla:toggle-sidebar`           | This command causes the package to toggle the sidebar |
| `tessla:toggle-message-panel`     | This command causes the package to toggle the message panel |
| `tessla:build-and-run-c-code`     | This command causes the package to build and run a binary compiled from C code that was found in the active project |
| `tessla:build-c-code`             | This command causes the package to build a binary compiled from C code that was found in the active project |
| `tessla:run-c-code`               | This command causes the package to run the binary `<project-name>` in `<project-directory>/build/` |
| `tessla:stop-current-process`     | This command causes the package to stop the process currently spawned and monitored by this package |
| `tessla:build-and-run-project`    | This command causes the package to pass step 1 to 8 from the [Tool Bar section](#tool-bar) |

## Authors

- [Denis-Michael Lux](https://www.github.com/dmlux/)<sup>(owner)</sup>
- Alexandra Lassota
- [Malte Schmitz](https://www.mlte.de)
