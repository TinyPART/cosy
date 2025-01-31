/*
 * Copyright 2013 Google Inc. All Rights Reserved.
 *           2015 Hauke Petersen <devel@haukepetersen.de>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * @author  Kerry Rodden
 * @author  Hauke Petersen  <devel@haukepetersen.de>
 */

// Dimensions of sunburst.
var width = 900;
var height = 900;
var radius = Math.min(width, height) / 2;

// Breadcrumb dimensions: width, height, spacing, width of tip/tail.
var b = {
  w: 100, h: 30, s: 3, t: 10
};

// Mapping of step names to colors.
var colors = {
  "app": "#d98b8f",
  "core": "#a173d1",
  "cpu": "#7b615c",
  "boards": "#de783b",
  "drivers": "#35a9b5",
  "sys": "#5687d1",
  "newlib": "#6ab975",
  "pkg": "#59a9c9",
  "fill": "#bbbbbb"
};

var DEFAULT_INPUTFILE = 'mem_t.csv'

// Total size of all segments; we set this later, after loading the data.
var totalSize = 0;
var vis;

// the complete dataset
var info;
var dataset;
var cur_view;

var partition = d3.layout.partition()
    .size([2 * Math.PI, radius * radius])
    .value(function(d) { return d.size; });

var arc = d3.svg.arc()
    .startAngle(function(d) { return d.x; })
    .endAngle(function(d) { return d.x + d.dx; })
    .innerRadius(function(d) { return Math.sqrt(d.y); })
    .outerRadius(function(d) { return Math.sqrt(d.y + d.dy); });

function createVisualization() {
    // Basic setup of page elements.
    initializeBreadcrumbTrail();
    drawLegend();

    d3.select("#btnExport").on("click", exportstuff);

    d3.select("#btnT").on("click", function() {
        update(['t']);
    });
    d3.select("#btnD").on("click", function() {
        update(['d']);
    });
    d3.select("#btnB").on("click", function() {
        update(['b']);
    });
    d3.select("#btnSum").on("click", function() {
        update(['t', 'd', 'b']);
    });
};

function updateChart(data) {
    d3.select("#chart svg").remove();
    vis = d3.select("#chart").append("svg:svg")
        .attr("width", width)
        .attr("height", height)
        .append("svg:g")
        .attr("id", "container")
        .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

    // Bounding circle underneath the sunburst, to make it easier to detect
    // when the mouse leaves the parent g.
    vis.append("svg:circle")
        .attr("r", radius)
        .style("opacity", 0);

    var nodes = partition.nodes(data);

    var path = vis.data([data]).selectAll("path")
        .data(nodes)
        .enter().append("svg:path")
        .attr("display", function(d) { return d.depth ? null : "none"; })
        .attr("d", arc)
        .attr("fill-rule", "evenodd")
        .style("fill", function(d) {
            tmp = d;
            if (!tmp.parent) {
                return "#333";
            }
            while (tmp.parent.parent) {
                tmp = tmp.parent;
            }
            return d3.rgb(colors[tmp.name]).darker(d.depth / 6);
        })
        .style("opacity", 1)
        .on("click", zoomIn)
        .on("mouseover", mouseover)
        .append("text").attr("dx", 12).attr("dy", ".35em").text(function(d) {return d.name });

    // Add the mouseleave handler to the bounding circle.
    d3.select("#container")
        .on("mouseleave", mouseleave)
        .on("contextmenu", zoomOut);

    // Get total size of the tree = value of root node from partition.
    totalSize = path.node().__data__.value;

    d3.select("#expl_per").text("100%");
    d3.select("#expl_sym").text(info.app);
    d3.select("#expl_size").text(totalSize + " byte");
};

// export svg to pdf of something else
function exportstuff(d) {
  console.log("ding ding", d);
};

function zoomIn(d) {
  console.log("zoom", d);
  updateChart(d);
};

function zoomOut(d) {
    d3.event.preventDefault();
    console.log("right click", d);
    updateChart(cur_view);
};

function updateTable(d) {
    var table = d3.select("#table");
    table.selectAll("tbody").remove();
    var body = table.append("tbody");
    tableAdd(d, body, 1);
};

function tableAdd(d, body, layer) {
    var row = body.append("tr").classed("l" + layer, true);
    row.append("td").text(d.name);
    row.append("td").text(d.value).classed("size", true);
    if (d.children && layer < 2) {
        for (var i = 0; i < d.children.length; i++) {
            tableAdd(d.children[i], body, layer + 1);
        }
    }
};




// Fade all but the current sequence, and show it in the breadcrumb trail.
function mouseover(d) {

  updateTable(d);

  var percentage = (100 * d.value / totalSize).toPrecision(3);
  var percentageString = percentage + "%";
  if (percentage < 0.1) {
    percentageString = "< 0.1%";
  }

  d3.select("#expl_per").text(percentageString);
  d3.select("#expl_sym").text(d.name);
  d3.select("#expl_size").text(d.value + " byte");

  // d3.select("#explanation")
  //     .style("visibility", "");

  var sequenceArray = getAncestors(d);
  updateBreadcrumbs(sequenceArray, percentageString);

  // Fade all the segments.
  d3.selectAll("path")
      .style("opacity", 0.3);

  // Then highlight only those that are an ancestor of the current segment.
  vis.selectAll("path")
      .filter(function(node) {
                return (sequenceArray.indexOf(node) >= 0);
              })
      .style("opacity", 1);
}

// Restore everything to full opacity when moving off the visualization.
function mouseleave(d) {

  updateTable(d);

  var name = (d.name == 'root') ? info['app'] : d.name;

  // show generic stats
  d3.select("#expl_per").text("100%");
  d3.select("#expl_sym").text(name);
  d3.select("#expl_size").text(totalSize + " byte");

  // Hide the breadcrumb trail
  d3.select("#trail")
      .style("visibility", "hidden");

  // Deactivate all segments during transition.
  d3.selectAll("path").on("mouseover", null);

  // Transition each segment to full opacity and then reactivate it.
  d3.selectAll("path")
      .transition()
      .duration(100)
      .style("opacity", 1)
      .each("end", function() {
              d3.select(this).on("mouseover", mouseover);
            });

  // d3.select("#explanation")
  //     .style("visibility", "hidden");
}

// Given a node in a partition layout, return an array of all of its ancestor
// nodes, highest first, but excluding the root.
function getAncestors(node) {
  var path = [];
  var current = node;
  while (current.parent) {
    path.unshift(current);
    current = current.parent;
  }
  return path;
}

function initializeBreadcrumbTrail() {
  // Add the svg area.
  var trail = d3.select("#sequence").append("svg:svg")
      .attr("width", width)
      .attr("height", 50)
      .attr("id", "trail");
  // Add the label at the end, for the percentage.
  trail.append("svg:text")
    .attr("id", "endlabel")
    .style("fill", "#000");
}

// Generate a string that describes the points of a breadcrumb polygon.
function breadcrumbPoints(d, i) {
  var points = [];
  points.push("0,0");
  points.push(b.w + ",0");
  points.push(b.w + b.t + "," + (b.h / 2));
  points.push(b.w + "," + b.h);
  points.push("0," + b.h);
  if (i > 0) { // Leftmost breadcrumb; don't include 6th vertex.
    points.push(b.t + "," + (b.h / 2));
  }
  return points.join(" ");
}

// Update the breadcrumb trail to show the current sequence and percentage.
function updateBreadcrumbs(nodeArray, percentageString) {

    // Data join; key function combines name and depth (= position in sequence).
    var g = d3.select("#trail")
        .selectAll("g")
        .data(nodeArray, function(d) { return d.name + d.depth; });

    // Add breadcrumb and label for entering nodes.
    var entering = g.enter().append("svg:g");

    entering.append("svg:polygon")
        .attr("points", breadcrumbPoints)
        // .style("fill", function(d) { return colors[d.name]; });
        .style("fill", function(d) {
            return d3.rgb(colors[nodeArray[0].name]).darker(d.depth / 6);
        });

  entering.append("svg:text")
      .attr("x", (b.w + b.t) / 2)
      .attr("y", b.h / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text(function(d) { return d.name; });

  // Set position for entering and updating nodes.
  g.attr("transform", function(d, i) {
    return "translate(" + i * (b.w + b.s) + ", 0)";
  });

  // Remove exiting nodes.
  g.exit().remove();

  // Now move and update the percentage at the end.
  d3.select("#trail").select("#endlabel")
      .attr("x", (nodeArray.length + 0.5) * (b.w + b.s))
      .attr("y", b.h / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text(percentageString);

  // Make the breadcrumb trail visible, if it's hidden.
  d3.select("#trail")
      .style("visibility", "");

}

function drawLegend() {

  // Dimensions of legend item: width, height, spacing, radius of rounded rect.
  var li = {
    w: 75, h: 30, s: 3, r: 3
  };

  d3.select("#legend svg").remove();

  var legend = d3.select("#legend").append("svg:svg")
      .attr("width", li.w)
      .attr("height", d3.keys(colors).length * (li.h + li.s));

  var g = legend.selectAll("g")
      .data(d3.entries(colors))
      .enter().append("svg:g")
      .attr("transform", function(d, i) {
              return "translate(0," + i * (li.h + li.s) + ")";
           });

  g.append("svg:rect")
      .attr("rx", li.r)
      .attr("ry", li.r)
      .attr("width", li.w)
      .attr("height", li.h)
      .style("fill", function(d) { return d.value; });

  g.append("svg:text")
      .attr("x", li.w / 2)
      .attr("y", li.h / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .text(function(d) { return d.key; });

    legend.style("visibility", "");
}


function filter(type, depth, root) {
    if (!root) {
        root = info['app'];      /* put application name here */
    }
    var r = {'name': root, 'children': []};
    for (var i = 0; i < dataset.length; i++) {
        // filter only requested types
        if (type.indexOf(dataset[i].type) == -1) {
            continue;
        }

        // add element to tree
        var e = r;
        var path = dataset[i]['path'].slice();
        path.push(dataset[i]['obj'])
        for (var j = 0; j < path.length; j++) {
            var child = undefined;
            // search for part
            for (var k = 0; k < e.children.length; k++) {
                if (e.children[k]['name'] == path[j]) {
                    child = e.children[k];
                }
            }
            if (!child) {
                e.children.push({'name': path[j], 'children': []}) - 1;
                child = e.children[e.children.length - 1];
            }
            e = child;
        }
        /* build the branch, now adding the leaf */
        e.children.push({'name': dataset[i]['sym'], 'size': dataset[i]['size']});
    }
    return r;
}

function update(fil) {
    cur_view = {};
    cur_view = filter(fil);
    updateChart(cur_view);
    updateTable(cur_view);
}


// bootstrap the whole damn thing
createVisualization();

d3.json("symbols.json", function(data) {
    info = data;
    dataset = data['symbols'];
    update(['t']);
});
