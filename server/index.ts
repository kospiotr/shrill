const memoryMap = new Map<string, string[]>(); // Memory map to store chunks

export default {
    fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/api/shrillup" && request.method === "GET") {
            const id = url.searchParams.get("id");
            const index = url.searchParams.get("index");
            const chunk = url.searchParams.get("chunk");

            if (!id || !index || !chunk) {
                return new Response("Missing parameters", { status: 400 });
            }

            console.log("Received parameters:", { id, index, chunk });

            // Store the chunk in the memory map
            if (!memoryMap.has(id)) {
                memoryMap.set(id, []);
            }
            const chunks = memoryMap.get(id);
            if (chunks) {
                chunks[parseInt(index, 10)] = chunk;
            }

            return new Response("OK", { status: 200 });
        }

        if (url.pathname === "/api/shrilldown" && request.method === "GET") {
            const id = url.searchParams.get("id");

            if (!id) {
                return new Response("Missing id parameter", { status: 400 });
            }

            const chunks = memoryMap.get(id);

            if (!chunks) {
                return new Response("File not found", { status: 404 });
            }

            try {
                const joinedContent = chunks.join('');
                const binaryContent = Uint8Array.from(atob(joinedContent), char => char.charCodeAt(0)); // Decode base64 to binary
                const fileBlob = new Blob([binaryContent], { type: "application/octet-stream" });

                return new Response(fileBlob, {
                    status: 200,
                    headers: {
                        "Content-Disposition": `attachment; filename="${id}.txt"`,
                        "Content-Type": "application/octet-stream",
                    },
                });
            } catch (error) {
                console.error("Error decoding or creating file:", error);
                return new Response("Error processing file", { status: 500 });
            }
        }

        return new Response(null, {status: 404});
    },
} satisfies ExportedHandler<Env>;

