/*global view, VIS, utils, d3 */
"use strict";

// The composition of a group of topics over the conditioning variable: a
// stacked area plot with one layer per topic, in distinct colors. In "group"
// mode each condition is scaled to 100%, showing how the group's words
// divide among its topics; in "corpus" mode the layers are the topics'
// shares of all words, so the top edge is the group's combined share.
//
// Layers are stacked by when each topic's weight within the group falls
// (its center of mass over the conditions), earliest at the bottom, so a
// shift in the group's language reads as a movement upward.
//
// p.container: selector of a div to draw into (its contents are managed here)
// p.keys: sorted condition keys
// p.key: the condition key object (invert, display)
// p.type, p.condition_name: the condition's type and name
// p.topics: [{ t, id, label, y }], y the topic's conditional proportions,
//   aligned with keys

view.composition = function (p) {
    var div = d3.select(p.container),
        mode = view.composition.modes[p.container] || "group",
        spec = utils.clone(VIS.topic_view),
        palette = d3.scale.category20().range()
            .concat(d3.scale.category20b().range()),
        fmt = d3.format(VIS.percent_format),
        totals, layers, color, xs, px, scale_x, scale_y, area, svg,
        paths, items, highlight, nearest, show_tip;

    // skeleton
    if (div.select(".composition_mode").empty()) {
        div.append("div")
            .classed("btn-group btn-group-xs composition_mode", true)
            .selectAll("button")
            .data([["group", "share of group"],
                ["corpus", "share of corpus"]])
            .enter().append("button")
            .attr("type", "button")
            .classed("btn btn-default", true)
            .text(function (d) { return d[1]; });
        div.append("p").classed("help composition_help", true);
        div.append("div").classed("composition_plot", true);
        div.append("div").classed("composition_legend", true);
    }

    div.classed("hidden", p.topics.length === 0 || p.keys.length === 0);
    if (p.topics.length === 0 || p.keys.length === 0) {
        return;
    }

    div.selectAll(".composition_mode button")
        .classed("active", function (d) { return d[0] === mode; })
        .on("click", function (d) {
            view.composition.modes[p.container] = d[0];
            view.composition(p);
        });

    div.select(".composition_help").text(mode === "group" ?
            "Each topic's share of the group's words, with every "
            + p.condition_name + " scaled to 100%. Topics are stacked "
            + "by when they are most prominent in the group, earliest at "
            + "the bottom."
            : "Each topic's share of all words, stacked, so the top edge "
            + "is the group's combined share. Topics are stacked by when "
            + "they are most prominent in the group, earliest at the "
            + "bottom.");

    // layers
    totals = p.keys.map(function (k, j) {
        return d3.sum(p.topics, function (t) { return t.y[j]; });
    });

    layers = p.topics.map(function (t) {
        var share = t.y.map(function (v, j) {
                return totals[j] > 0 ? v / totals[j] : 0;
            }),
            mass = d3.sum(share);
        return {
            t: t.t,
            id: t.id,
            label: t.label,
            share: share,
            frac: t.y,
            total: d3.sum(t.y),
            center: mass > 0 ? d3.sum(share, function (s, j) {
                return s * j;
            }) / mass : 0
        };
    });

    // colors by overall weight, so the largest topics get the first colors
    color = d3.map();
    layers.slice().sort(function (a, b) {
        return d3.descending(a.total, b.total) || d3.ascending(a.t, b.t);
    }).forEach(function (l, j) {
        color.set(l.id, palette[j % palette.length]);
    });

    layers.sort(function (a, b) {
        return d3.ascending(a.center, b.center) || d3.ascending(a.t, b.t);
    });
    layers.forEach(function (l, i) {
        l.color = color.get(l.id);
        l.values = (mode === "group" ? l.share : l.frac)
            .map(function (v, j) {
                return {
                    y: v,
                    y0: i === 0 ? 0
                        : layers[i - 1].values[j].y0
                            + layers[i - 1].values[j].y
                };
            });
    });

    // plot
    spec.w = div.node().clientWidth || spec.w;
    spec.w = Math.max(spec.w, VIS.topic_view.w);
    spec.w -= spec.m.left + spec.m.right;
    spec.h = Math.floor(spec.w / 2.5) - spec.m.top - spec.m.bottom;

    svg = div.select(".composition_plot").selectAll("svg").data([1]);
    svg.enter().call(view.append_plot);
    svg = view.setup_plot(svg, spec);

    xs = p.keys.map(function (k) { return p.key.invert(k); });
    scale_x = view.composition.scale_x(p.type, xs, spec.w);
    px = xs.map(function (x) { return scale_x(x); });

    scale_y = d3.scale.linear()
        .domain([0, mode === "group" ? 1 : d3.max(totals)])
        .range([spec.h, 0])
        .nice();

    view.composition.axes({
        svg: svg,
        spec: spec,
        type: p.type,
        scale_x: scale_x,
        scale_y: scale_y,
        condition_name: p.condition_name
    });

    area = d3.svg.area()
        .x(function (d, j) { return px[j]; })
        .y0(function (d) { return scale_y(d.y0); })
        .y1(function (d) { return scale_y(d.y0 + d.y); });

    svg.selectAll("g.composition_layers").data([1])
        .enter().append("g").classed("composition_layers", true);

    paths = svg.select("g.composition_layers")
        .selectAll("path.composition_layer")
        .data(layers, function (l) { return l.id; });
    paths.enter().append("path").classed("composition_layer", true);
    paths.exit().remove();
    paths.order()
        .classed("faded", false)
        .style("fill", function (l) { return l.color; })
        .attr("d", function (l) { return area(l.values); });

    // legend: top of the stack first
    items = div.select(".composition_legend")
        .selectAll("a.composition_item")
        .data(layers.slice().reverse(), function (l) { return l.id; });
    items.enter().append("a")
        .classed("composition_item", true)
        .call(function (a) {
            a.append("span").classed("group_swatch", true);
            a.append("span").classed("composition_label", true);
        });
    items.exit().remove();
    items.order()
        .classed("faded", false)
        .attr("href", function (l) {
            return view.dfb().view_link({ type: "topic", param: l.id });
        });
    items.select("span.group_swatch")
        .style("background-color", function (l) { return l.color; });
    items.select("span.composition_label")
        .text(function (l) { return l.label; });

    // interaction
    highlight = function (id) {
        paths.classed("faded", function (l) {
            return id !== undefined && l.id !== id;
        });
        items.classed("faded", function (l) {
            return id !== undefined && l.id !== id;
        });
    };

    nearest = function (x) {
        var best = 0;
        px.forEach(function (v, j) {
            if (Math.abs(v - x) < Math.abs(px[best] - x)) {
                best = j;
            }
        });
        return best;
    };

    show_tip = function (l, j) {
        var tt = view.tooltip(),
            tp = tt.div.select("p");
        tp.text("");
        tp.append("strong").text(l.label);
        tp.append("br");
        tp.append("span").text(p.key.display(p.keys[j]) + ": "
            + fmt(l.share[j]) + " of group, "
            + fmt(l.frac[j]) + " of corpus");
        tt.update_pos();
        tt.show();
    };

    paths.on("mouseover", function (l) { highlight(l.id); })
        .on("mousemove", function (l) {
            show_tip(l, nearest(d3.mouse(this)[0]));
        })
        .on("mouseout", function () {
            highlight();
            view.tooltip().hide();
        })
        .on("click", function (l) {
            view.dfb().set_view({ type: "topic", param: l.id });
        });

    items.on("mouseover", function (l) { highlight(l.id); })
        .on("mouseout", function () { highlight(); });
};

// chosen display mode for each container: "group" or "corpus"
view.composition.modes = { };

// x scale for a condition of the given type over values xs
view.composition.scale_x = function (type, xs, w) {
    var scale;
    if (type === "time") {
        scale = d3.time.scale.utc().domain(d3.extent(xs)).range([0, w]);
    } else if (type === "continuous") {
        scale = d3.scale.linear().domain(d3.extent(xs)).range([0, w]);
    } else {
        scale = d3.scale.ordinal().domain(xs).rangePoints([0, w], 1);
    }
    return scale;
};

// x and y axes, with percentage gridlines, as in the topic plots
view.composition.axes = function (p) {
    var axes = p.svg.selectAll("g.axis").data(["x", "y"]),
        spec = p.spec;

    axes.enter().append("g").classed("axis", true)
        .classed("x", function (v) { return v === "x"; })
        .classed("y", function (v) { return v === "y"; });
    axes.attr("transform", function (v) {
        return v === "x" ? "translate(0," + spec.h + ")" : undefined;
    })
        .each(function (v) {
            var sel = d3.select(this),
                ax = d3.svg.axis()
                    .scale(v === "x" ? p.scale_x : p.scale_y)
                    .orient(v === "x" ? "bottom" : "left");
            if (v === "x") {
                if (p.type === "time") {
                    if (spec.time.ticks.unit) {
                        ax.ticks(d3.time[spec.time.ticks.unit].utc,
                            spec.time.ticks.n);
                    } else if (typeof spec.time.ticks === "number") {
                        ax.ticks(spec.time.ticks);
                    }
                } else if (p.type === "continuous") {
                    ax.ticks(spec.continuous.ticks);
                }
            } else {
                ax.tickSize(-spec.w)
                    .outerTickSize(0)
                    .tickFormat(d3.format(VIS.percent_format))
                    .ticks(spec.ticks_y);
            }
            sel.call(ax);
            if (v === "y") {
                sel.selectAll("g")
                    .filter(function (d) { return d > 0; })
                    .classed("minor", true);
            }
        });

    p.svg.selectAll("text.axis_label").data([1])
        .enter().append("text").classed("axis_label", true);
    p.svg.select("text.axis_label")
        .attr("x", spec.w / 2)
        .attr("y", spec.h + spec.m.bottom)
        .attr("text-anchor", "middle")
        .text(p.condition_name);
};
