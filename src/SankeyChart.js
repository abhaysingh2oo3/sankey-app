import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { sankeyCircular, sankeyCenter } from "d3-sankey-circular";
import { processExcelData } from './utils/excelProcessor';

const SankeyChart = ({ data: propData }) => {
  const [data, setData] = useState(propData || null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [allKeys, setAllKeys] = useState([]);
  const [keyPaths, setKeyPaths] = useState(new Map());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const svgRef = useRef();
  const containerRef = useRef();
  
  // Create color scale for keys (not values)
  const keyColorScale = useRef(d3.scaleOrdinal(d3.schemeTableau10)).current;

  // create path for each key
  const buildKeyPaths = (links) => {
    const paths = new Map();
    
    links.forEach(link => {
      if (link.flowKeys) {
        link.flowKeys.forEach(key => {
          if (!paths.has(key)) {
            paths.set(key, []);
          }
          paths.get(key).push(link);
        });
      }
    });
    
    return paths;
  };

  // File upload handler
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      try {
        const processedData = await processExcelData(file);
        setData(processedData);
      } catch (error) {
        console.error('Error processing Excel file:', error);
        alert('Error processing file. Please check the format and try again.');
      }
    }
  };
  // Handle responsive resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Extract all unique keys from data
  useEffect(() => {
    if (!data) return;
    
    const keys = new Set();
    data.links.forEach(link => {
      if (link.flowKeys) {
        link.flowKeys.forEach(key => keys.add(key));
      }
    });
    
    const sortedKeys = Array.from(keys).sort();
    setAllKeys(sortedKeys);
    
    // Build paths for each key
    const paths = buildKeyPaths(data.links);
    setKeyPaths(paths);
  }, [data]);

  // Main rendering effect
  useEffect(() => {
    if (!data || dimensions.width === 0) return;

    // Calculate dynamic dimensions based on data size and container
    const nodeCount = data.nodes.length;
    const linkCount = data.links.length;
    
    // Group nodes by prefix to get column count
    const prefixes = new Set();
    data.nodes.forEach(node => {
      const match = node.name.match(/^([A-Za-z]+)(\d+)?/);
      const prefix = match ? match[1] : node.name.charAt(0);
      prefixes.add(prefix);
    });
    const columnCount = prefixes.size;
    
    // Calculate max nodes in any column
    const nodesByPrefix = new Map();
    data.nodes.forEach(node => {
      const match = node.name.match(/^([A-Za-z]+)(\d+)?/);
      const prefix = match ? match[1] : node.name.charAt(0);
      if (!nodesByPrefix.has(prefix)) {
        nodesByPrefix.set(prefix, 0);
      }
      nodesByPrefix.set(prefix, nodesByPrefix.get(prefix) + 1);
    });
    const maxNodesInColumn = Math.max(...Array.from(nodesByPrefix.values()));
    
    // Responsive sizing based on container and data
    const containerWidth = dimensions.width;
    const containerHeight = Math.max(600, dimensions.height);
    
    const legendWidth = 220;
    const margin = { 
      top: Math.max(60, containerHeight * 0.08), 
      right: Math.max(30, containerWidth * 0.02), 
      bottom: Math.max(30, containerHeight * 0.05), 
      left: Math.max(60, containerWidth * 0.04) 
    };
    
    // Calculate optimal dimensions
    const availableWidth = containerWidth - margin.left - margin.right - legendWidth;
    const availableHeight = containerHeight - margin.top - margin.bottom;
    
    const widthPerColumn = Math.max(200, availableWidth / columnCount);
    const heightPerNode = Math.max(60, availableHeight / maxNodesInColumn);
    
    const width = Math.min(availableWidth, columnCount * widthPerColumn);
    const height = Math.min(availableHeight, maxNodesInColumn * heightPerNode);

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    // Create SVG with proper structure (add space for legend on the right)
    const svg = d3.select(svgRef.current)
      .attr("width", width + margin.left + margin.right + legendWidth)
      .attr("height", height + margin.top + margin.bottom)
      .attr("viewBox", `0 0 ${width + margin.left + margin.right + legendWidth} ${height + margin.top + margin.bottom}`)
      .attr("preserveAspectRatio", "xMidYMid meet")
      .style("max-width", "100%")
      .style("height", "auto");

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Custom node positioning function
    const customNodePositioning = (nodes, links) => {
      // Group nodes by prefix (A, B, C, D, etc.)
      const nodesByPrefix = new Map();
      const prefixOrder = [];
      
      nodes.forEach(node => {
        const match = node.name.match(/^([A-Za-z]+)(\d+)?/);
        const prefix = match ? match[1] : node.name.charAt(0);
        const suffix = match && match[2] ? parseInt(match[2]) : 0;
        
        if (!nodesByPrefix.has(prefix)) {
          nodesByPrefix.set(prefix, []);
          prefixOrder.push(prefix);
        }
        
        nodesByPrefix.get(prefix).push({
          ...node,
          prefix,
          suffix,
          originalName: node.name
        });
      });
      
      // Sort prefixes alphabetically
      prefixOrder.sort();
      
      // Sort nodes within each prefix by suffix
      nodesByPrefix.forEach(prefixNodes => {
        prefixNodes.sort((a, b) => a.suffix - b.suffix);
      });
      
      // Calculate positions - responsive node sizing
      const columnWidth = width / prefixOrder.length;
      const nodeWidth = Math.max(6, Math.min(12, width / (prefixOrder.length * 50)));
      const nodeHeight = Math.max(30, Math.min(60, height / (maxNodesInColumn * 1.5)));
      const nodePadding = Math.max(10, nodeHeight * 0.25); // Spacing between nodes in same column
      
      const positionedNodes = [];
      
      // Position each column's nodes compactly
      prefixOrder.forEach((prefix, columnIndex) => {
        const prefixNodes = nodesByPrefix.get(prefix);
        const x = columnIndex * columnWidth + columnWidth / 2 - nodeWidth / 2;
        
        // Calculate total height needed for this column
        const totalNodesHeight = prefixNodes.length * nodeHeight + (prefixNodes.length - 1) * nodePadding;
        const startY = (height - totalNodesHeight) / 2; // Center vertically
        
        prefixNodes.forEach((node, nodeIndex) => {
          const y = startY + nodeIndex * (nodeHeight + nodePadding);
          
          positionedNodes.push({
            ...node,
            name: node.originalName,
            x0: x,
            x1: x + nodeWidth,
            y0: y,
            y1: y + nodeHeight,
            value: 1 // Default value for custom positioning
          });
        });
      });
      
      return positionedNodes;
    };

    // Configure sankey generator for links only
    const sankeyGen = sankeyCircular()
      .nodeId(d => d.name)
      .nodeWidth(8)
      .nodePadding(15)
      .nodeAlign(sankeyCenter)
      .extent([[1, 1], [width - 1, height - 6]])
      .iterations(32)
      .circularLinkGap(4);

    // First, generate standard sankey layout to get links
    const standardLayout = sankeyGen({
      nodes: data.nodes.map(d => ({ ...d })),
      links: data.links.map(d => ({
        source: d.source,
        target: d.target,
        value: +d.value,
        flowKeys: d.flowKeys || []
      }))
    });

    // Use custom positioning for nodes
    const nodes = customNodePositioning(standardLayout.nodes, standardLayout.links);
    
    // Update links to reference custom positioned nodes
    const nodeMap = new Map(nodes.map(n => [n.name, n]));
    const links = standardLayout.links.map(link => ({
      ...link,
      source: nodeMap.get(link.source.name),
      target: nodeMap.get(link.target.name)
    }));

    // Get nodes involved in selected key's path
    const getNodesForKey = (key) => {
      const nodeSet = new Set();
      const linksForKey = keyPaths.get(key) || [];
      
      linksForKey.forEach(link => {
        const matchingLink = links.find(l => 
          l.source.name === link.source && l.target.name === link.target
        );
        if (matchingLink) {
          nodeSet.add(matchingLink.source);
          nodeSet.add(matchingLink.target);
        }
      });
      
      return nodeSet;
    };

    // Custom link path generator for our custom positioning
    const customLinkPath = (d) => {
      const sourceX = d.source.x1;
      const sourceY = d.source.y0 + (d.source.y1 - d.source.y0) / 2;
      const targetX = d.target.x0;
      const targetY = d.target.y0 + (d.target.y1 - d.target.y0) / 2;
      
      const curvature = 0.5;
      const xi = d3.interpolateNumber(sourceX, targetX);
      const x2 = xi(curvature);
      const x3 = xi(1 - curvature);
      
      return `M${sourceX},${sourceY}C${x2},${sourceY} ${x3},${targetY} ${targetX},${targetY}`;
    };

    // Draw links - ALL GRAY like in the image
    const linkElements = g.append("g")
      .attr("class", "links")
      .attr("fill", "none")
      .attr("stroke-linecap", "round")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("d", customLinkPath)
      .attr("stroke", d => {
        // Check if this link is part of the selected key's path
        if (selectedKey) {
          const linksForKey = keyPaths.get(selectedKey) || [];
          const isInPath = linksForKey.some(link => 
            link.source === d.source.name && link.target === d.target.name
          );
          return isInPath ? "#666" : "#e0e0e0"; // Darker gray for selected path
        }
        return "#999"; // Default gray
      })
      .attr("stroke-width", d => Math.max(1, d.value * 2))
      .attr("opacity", d => {
        if (!selectedKey) return 0.4;
        const linksForKey = keyPaths.get(selectedKey) || [];
        const isInPath = linksForKey.some(link => 
          link.source === d.source.name && link.target === d.target.name
        );
        return isInPath ? 0.7 : 0.15;
      })
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        // Find which key this link belongs to and select it
        if (d.flowKeys && d.flowKeys.length > 0) {
          setSelectedKey(selectedKey === d.flowKeys[0] ? null : d.flowKeys[0]);
        }
      })
      .append("title")
      .text(d => {
        const keys = d.flowKeys ? d.flowKeys.join(", ") : "No keys";
        return `${d.source.name} → ${d.target.name}\nKeys: ${keys}`;
      });

    // Draw nodes as VERTICAL COLORED BARS (like in the image)
    const nodeElements = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`)
      .style("cursor", "pointer");

    // Vertical colored bar for each node
    nodeElements.append("rect")
      .attr("height", d => Math.max(1, d.y1 - d.y0))
      .attr("width", d => d.x1 - d.x0)
      .attr("rx", 0) // No rounded corners for vertical bars
      .attr("ry", 0)
      .attr("fill", d => {
        // Each node gets a unique color based on its name
        return keyColorScale(d.name);
      })
      .attr("stroke", "none")
      .attr("opacity", d => {
        if (!selectedKey) return 0.9;
        const nodesInPath = getNodesForKey(selectedKey);
        return nodesInPath.has(d) ? 1 : 0.3;
      })
      .on("mouseover", function(event, d) {
        d3.select(this).attr("opacity", 1);
      })
      .on("mouseout", function(event, d) {
        if (!selectedKey) {
          d3.select(this).attr("opacity", 0.9);
        } else {
          const nodesInPath = getNodesForKey(selectedKey);
          d3.select(this).attr("opacity", nodesInPath.has(d) ? 1 : 0.3);
        }
      });

    // Add node labels OUTSIDE the bars (to the left or right)
    nodeElements.append("text")
      .attr("x", d => {
        // Position text to the left for left-side nodes, right for right-side nodes
        return d.x0 < width / 2 ? -8 : (d.x1 - d.x0) + 8;
      })
      .attr("y", d => (d.y1 - d.y0) / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", d => d.x0 < width / 2 ? "end" : "start")
      .text(d => d.name)
      .style("font-size", `${Math.max(11, Math.min(15, containerWidth / 100))}px`)
      .style("font-weight", "600")
      .style("fill", d => {
        if (!selectedKey) return "#333";
        const nodesInPath = getNodesForKey(selectedKey);
        return nodesInPath.has(d) ? keyColorScale(selectedKey) : "#999";
      })
      .style("pointer-events", "none");

    // Add legend for keys - positioned to the right of the diagram
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width + margin.left + 30}, ${margin.top})`);

    legend.append("text")
      .attr("x", 0)
      .attr("y", -10)
      .style("font-size", `${Math.max(12, Math.min(16, containerWidth / 100))}px`)
      .style("font-weight", "bold")
      .text("Keys (Click to trace)");

    allKeys.forEach((key, i) => {
      const legendRow = legend.append("g")
        .attr("transform", `translate(0, ${i * 25})`)
        .style("cursor", "pointer")
        .on("click", () => {
          setSelectedKey(selectedKey === key ? null : key);
        });

      legendRow.append("rect")
        .attr("width", 18)
        .attr("height", 18)
        .attr("rx", 3)
        .attr("fill", keyColorScale(key))
        .attr("opacity", selectedKey === null ? 1 : (selectedKey === key ? 1 : 0.3))
        .attr("stroke", selectedKey === key ? "#000" : "none")
        .attr("stroke-width", 2);

      legendRow.append("text")
        .attr("x", 25)
        .attr("y", 9)
        .attr("dy", "0.35em")
        .style("font-size", `${Math.max(11, Math.min(14, containerWidth / 120))}px`)
        .style("font-weight", selectedKey === key ? "bold" : "normal")
        .text(key);
    });

  }, [data, selectedKey, allKeys, keyPaths, keyColorScale, dimensions]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      minHeight: '100vh', 
      padding: 'clamp(15px, 3vw, 30px)',
      backgroundColor: '#fafafa',
      boxSizing: 'border-box'
    }}>
      <div style={{ 
        marginBottom: '25px',
        backgroundColor: 'white',
        padding: 'clamp(15px, 2.5vw, 20px)',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{ 
          margin: '0 0 8px 0', 
          color: '#2c3e50',
          fontSize: '24px',
          fontWeight: '700'
        }}>
          Sankey Flow Visualization
        </h2>
        <p style={{ 
          margin: '0 0 15px 0', 
          color: '#7f8c8d', 
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          {selectedKey 
            ? `Tracing pipeline for: ${selectedKey}` 
            : 'Click on a key in the legend to trace its complete pipeline path'}
        </p>
        
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!data && (
            <>
              <label style={{
                padding: '10px 20px',
                border: '2px solid #3498db',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                backgroundColor: '#3498db',
                color: 'white',
                transition: 'all 0.3s ease',
                display: 'inline-block'
              }}>
                 Upload Excel File
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </>
          )}
          
          {data && !propData && (
            <button
              onClick={() => {
                setData(null);
                setSelectedKey(null);
                setAllKeys([]);
                setKeyPaths(new Map());
              }}
              style={{
                padding: '10px 20px',
                border: '2px solid #95a5a6',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                backgroundColor: '#0574f3ff',
                color: 'white',
                transition: 'all 0.3s ease'
              }}
            >
              Load New Data
            </button>
          )}
          
          {selectedKey && (
            <button
              onClick={() => setSelectedKey(null)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#ab1909ff',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.3s ease'
              }}
            >
              ✕ Clear Selection
            </button>
          )}
          
          {allKeys.length > 0 && (
            <span style={{ 
              color: '#95a5a6',
              fontSize: '13px',
              marginLeft: 'auto'
            }}>
              {allKeys.length} unique key{allKeys.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </div>
      
      <div 
        ref={containerRef}
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          width: '100%',
          minHeight: '600px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'auto'
        }}>
        <svg ref={svgRef}></svg>
      </div>
      
      {!data && (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: '#bdc3c7',
          fontSize: '16px',
          backgroundColor: 'white',
          borderRadius: '8px',
          marginTop: '20px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}></div>
          {propData ? 'Loading data...' : 'Upload an Excel file with columns: source, destination, key'}
        </div>
      )}
    </div>
  );
};

export default SankeyChart;
