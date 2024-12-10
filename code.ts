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
        if (!processedAsImage) {
          try {
            console.log("Attempting to export artboard:", artboard.name);
            const bytes = await artboard.exportAsync({
              format: "PNG",
              constraint: { type: "SCALE", value: 1 },
            });

            console.log("Export successful, bytes length:", bytes?.length);

            // Convert bytes to base64
            const base64 = figma.base64Encode(bytes);

            results.push({
              type: "image",
              name: artboard.name || "Unnamed Artboard",
              base64: base64,
            });
          } catch (error) {
            console.error("Error exporting Artboard:", artboard.name, error);
          }
        }
      }
    }

    console.log("Results:", results);

    figma.ui.postMessage({
      type: "process-results",
      results: results,
    });
  } else if (msg.type === "upload-images") {
    await uploadImages(msg.results);
  } else if (msg.type === "cancel") {
    console.log("Plugin cancelled.");
    figma.closePlugin();
  }
};

// Define the type for results
interface Result {
  base64: string;
  name: string;
}

// Custom Base64 decoding function
function decodeBase64(base64: string): Uint8Array {
  // Replace URL-safe Base64 characters with standard Base64 characters
  base64 = base64.replace(/-/g, "+").replace(/_/g, "/");

  // Decode Base64 using a custom decoding algorithm
  const base64Characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let binaryString = "";

  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = base64Characters.indexOf(base64[i]);
    const encoded2 = base64Characters.indexOf(base64[i + 1]);
    const encoded3 = base64Characters.indexOf(base64[i + 2]);
    const encoded4 = base64Characters.indexOf(base64[i + 3]);

    const byte1 = (encoded1 << 2) | (encoded2 >> 4);
    const byte2 = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    const byte3 = ((encoded3 & 3) << 6) | encoded4;

    binaryString += String.fromCharCode(byte1);
    if (encoded3 !== 64) binaryString += String.fromCharCode(byte2);
    if (encoded4 !== 64) binaryString += String.fromCharCode(byte3);
  }

  // Convert the binary string into a Uint8Array
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper function to create multipart/form-data payload
function createMultipartPayload(
  fileName: string,
  fileBytes: Uint8Array
): { body: string; boundary: string } {
  const boundary =
    "----WebKitFormBoundary" + Math.random().toString(36).slice(2); // Generate a random boundary
  let body = `--${boundary}\r\n`;
  body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
  body += `Content-Type: image/png\r\n\r\n`;

  // Convert Uint8Array to binary string
  const binaryString = Array.from(fileBytes)
    .map((byte) => String.fromCharCode(byte))
    .join("");

  body += binaryString + `\r\n`;
  body += `--${boundary}--\r\n`;

  return { body, boundary };
}

// Function to upload processed images to the API
async function uploadImages(results: Result[]) {
  for (const result of results) {
    try {
      // Decode base64 to raw bytes
      const bytes = decodeBase64(result.base64);

      const { body, boundary } = createMultipartPayload(
        `${result.name}.png`,
        bytes
      );

      const response = await fetch(
        "https://xx6p-p9vy-wihs.n7d.xano.io/api:OmYrqEvY/upload-images",
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Disposition": `attachment; filename="${result.name}.png"`, // Explicitly specify filename with extension
          },
          body: body,
        }
      );

      if (!response.ok) {
        throw new Error(`Upload failed for ${result.name}: ${response.status}`);
      }

      const responseData = await response.json();
      console.log(`Uploaded ${result.name} successfully:`, responseData);

      // Notify UI of success
      figma.ui.postMessage({
        type: "success",
        message: `${result.name} uploaded successfully.`,
        response: responseData,
      });
    } catch (error) {
      console.error(`Error uploading ${result.name}:`, error);

      // Notify UI of error
      figma.ui.postMessage({
        type: "error",
        message: `Failed to upload ${result.name}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }

  figma.ui.postMessage({
    type: "upload-complete",
    message: "All images uploaded.",
  });
}
