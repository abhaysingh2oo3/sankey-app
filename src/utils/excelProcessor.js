import * as XLSX from 'xlsx';

export const processExcelData = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        // Convert Excel data to Sankey format
        const nodes = new Set();
        const links = new Map(); // Use map to combine flows with same source-target
        const keyFlows = new Map(); // Track flows by key

        // First pass: collect all nodes and group by key
        rawData.forEach(row => {
          const source = row.source || row.Source;
          const destination = row.destination || row.Destination;
          const key = row.key || row.Key;

          if (source && destination && key) {
            nodes.add(source);
            nodes.add(destination);
            
            // Track flow by key
            if (!keyFlows.has(key)) {
              keyFlows.set(key, new Set());
            }
            keyFlows.get(key).add(`${source}-${destination}`);
            
            // Create or update link
            const linkKey = `${source}-${destination}`;
            if (!links.has(linkKey)) {
              links.set(linkKey, {
                source,
                target: destination,
                value: 1,
                keys: new Set([key])
              });
            } else {
              const link = links.get(linkKey);
              link.keys.add(key);
              // Increment value only for unique keys
              if (link.keys.size > link.value) {
                link.value = link.keys.size;
              }
            }
          }
        });

        const sankeyData = {
          nodes: Array.from(nodes).map(name => ({ name })),
          links: Array.from(links.values()).map(link => ({
            source: link.source,
            target: link.target,
            value: link.value,
            flowKeys: Array.from(link.keys)
          }))
        };

        resolve(sankeyData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = error => reject(error);
    reader.readAsArrayBuffer(file);
  });
};
