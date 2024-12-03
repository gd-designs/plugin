figma.showUI(__html__, { width: 600, height: 600 });

// Close the plugin when the user clicks outside the plugin
figma.ui.onmessage = (msg) => {
  if (msg === "close-plugin") {
    figma.closePlugin();
  }
};
