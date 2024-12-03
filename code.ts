// Show the plugin UI
figma.showUI(__html__, { width: 600, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === "process-frame") {
    const selection = figma.currentPage.selection;

    if (selection.length === 0 || selection[0].type !== "FRAME") {
      figma.ui.postMessage({
        type: "error",
        message: "Please select a frame to process.",
      });
      return;
    }

    const frame = selection[0];
    console.log("Selected frame:", frame);

    const children = frame.children;
    console.log("Frame children:", children);

    // Look for Artboard elements
    const artboards = children.filter((child) => child.name === "Artboard");
    console.log("Artboards:", artboards);

    const results = [];

    for (const artboard of artboards) {
      if (artboard.type === "FRAME" || artboard.type === "GROUP") {
        const artboardChildren = artboard.children;
        console.log("Artboard children:", artboardChildren);

        let processedAsImage = false;

        // Check if the Artboard has an IMAGE node
        for (const node of artboardChildren) {
          console.log("Processing node:", node);

          if ("fills" in node && node.fills) {
            const fills = node.fills as Paint[];
            const imageFill = fills.find((fill) => fill.type === "IMAGE");

            if (imageFill && imageFill.imageHash) {
              try {
                const image = figma.getImageByHash(imageFill.imageHash);
                if (!image) {
                  console.log(`Invalid image hash for ${node.name}`);
                  figma.ui.postMessage({
                    type: "error",
                    message: `Image hash is invalid for ${node.name}.`,
                  });
                  continue;
                }

                const bytes = await image.getBytesAsync();
                const base64 = figma.base64Encode(bytes);

                results.push({
                  type: "image",
                  name: node.name,
                  base64: base64,
                });
                processedAsImage = true; // Mark as processed
              } catch (error) {
                console.error("Error processing image node:", error);
                figma.ui.postMessage({
                  type: "error",
                  message: `Error processing image node ${node.name}.`,
                });
              }
            }
          }
        }

        // If no IMAGE node is found, export the entire Artboard as an image
        if (!processedAsImage) {
          try {
            console.log(`Exporting entire Artboard: ${artboard.name}`);
            const bytes = await artboard.exportAsync({ format: "PNG" });
            const base64 = figma.base64Encode(bytes);

            results.push({
              type: "artboard",
              name: artboard.name,
              base64: base64,
            });
          } catch (error) {
            console.error("Error exporting Artboard:", error);
            figma.ui.postMessage({
              type: "error",
              message: `Error exporting Artboard ${artboard.name}.`,
            });
          }
        }
      }
    }

    console.log("Results:", results);
    figma.ui.postMessage({
      type: "process-results",
      results: results,
    });
  } else if (msg.type === "cancel") {
    console.log("Plugin cancelled.");
    figma.closePlugin();
  }
};
