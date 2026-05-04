import * as d3 from "d3";
import {default as crossfilter} from "https://cdn.skypack.dev/crossfilter2@1.5.4?min";
import {
    make_frame,
    make_sub_frame,
    make_bridge_frame,
} from "../lib/fancy-frames.js";

import {
    C,
    reshape,
    create_svg,
    linspace,
    zip,
    scatter,
    overflow_box,
    scatter_gl,
} from "../lib.js";

import {
    clear_path,
    clear_selected,
    define_arrowhead,
    draw_boxes,
    draw_path,
    get_point_style,
    set_pred,
    set_selected,
    set_selected_2,
    set_brushed,
    update_brush_history,
    update_point_style_gl,
    depth_func,
} from "./view-utils.js";

export default class ProjectionView {
    constructor(
        data,
        {
            x,
            y,
            c,
            s,
            predicate_engine,
            predicate_mode = "data extent",
            brush_mode = "single",
            tear_indices = [],
        } = {},
        model,
        controller,
        config,
    ) {
        console.log("new ProjectionView");

        this.data = data;
        this.model = model;
        this.x = x;
        this.y = y;
        this.s = s;
        this.c = c;

        this.controller = controller;
        this.config = config;
        this.attributes = Object.keys(data[0]);

        // === TEAR-AWARE DEBUG CHECK ===
        console.log("[DimBridge tear-aware] first data row:", this.data[0]);

        console.log(
            "[DimBridge tear-aware] tear column check:",
            this.data.filter((d) => Number(d.tear_flag) === 1).length,
            "out of",
            this.data.length,
        );

        // === TEAR-AWARE SETUP ===
        this.tear_indices = tear_indices || [];
        this.tear_index_set = new Set(this.tear_indices.map((d) => Number(d)));

        console.log(
            "[DimBridge tear-aware] tear_indices loaded:",
            this.tear_indices.length,
        );

        this.brush_cf = this.init_brush_crossfilter(data, this.attributes);
        this.predicate_cf = this.init_predicate_crossfilter(
            data,
            this.attributes,
        );

        this.node = this.init_node();

        this.draw();
        this.brush = this.init_brush();

        this.predicate_engine = predicate_engine;
        this.set_predicate_callback();

        this.predicate_mode = this.predicate_engine.mode;
        this.brush_mode = brush_mode;

        return this;
    }

    set_predicate_callback() {
        this.model.on("change:predicates", (event, data) => {
            let {predicates, qualities} = data;
            console.log("PREDICATES", predicates);

            let attributes_union = d3
                .groups(predicates.flat(), (d) => d.attribute)
                .map((d) => d[0]);

            predicates = predicates.map((predicate_t) => {
                let key_value_pairs = predicate_t.map((p) => [
                    p.attribute,
                    p.interval,
                ]);

                let predicate = Object.fromEntries(key_value_pairs);

                for (let attr of attributes_union) {
                    if (predicate[attr] === undefined) {
                        predicate[attr] = this.predicate_engine.extent[attr];
                    }
                }

                return predicate;
            });

            if (predicates !== undefined && predicates.length >= 1) {
                let last_predicate = predicates[predicates.length - 1];

                set_selected(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                set_pred(
                    this.data,
                    last_predicate,
                    this.attributes,
                    this.predicate_cf,
                    this.predicate_cf_dimensions,
                );

                if (this.n_boxes == 1) {
                    update_point_style_gl(this.sca, "confusion");
                } else if (this.n_boxes == 2) {
                    update_point_style_gl(this.sca, "contrastive");
                } else {
                    update_point_style_gl(this.sca, "brush");
                }

                this.controller.on_projection_view_change(predicates);
            }
        });

        this.model.on("change:tear_indices", (event, data) => {
            this.tear_indices = data.tear_indices || [];
            this.tear_index_set = new Set(this.tear_indices.map((d) => Number(d)));

            console.log(
                "[DimBridge tear-aware] received tear_indices:",
                this.tear_indices.length,
            );
        });
    }

    init_brush_crossfilter(data, attributes) {
        let cf = crossfilter(data);

        this.brush_cf_dimensions = {
            x: cf.dimension((d, i) => this.x[i]),
            y: cf.dimension((d, i) => this.y[i]),
        };

        return cf;
    }

    init_predicate_crossfilter(data, attributes) {
        let cf_attributes = attributes.slice();
        let cf = crossfilter(data);

        let cf_dimensions = cf_attributes.map((attr) =>
            cf.dimension((d) => d[attr]),
        );

        this.predicate_cf_dimensions = Object.fromEntries(
            zip(cf_attributes, cf_dimensions),
        );

        return cf;
    }

    init_node() {
        let {width, scatter_width, scatter_height, font_size, scatter_padding} =
            this.config;

        this.plot_width = width * scatter_width;
        this.plot_height = width * scatter_height + 2.6 * font_size;

        this.padding_left = scatter_padding;
        this.padding_right = scatter_padding;
        this.padding_bottom = scatter_padding;
        this.padding_top = font_size * 1.6 + scatter_padding;

        this.fancy_frame = d3
            .create("svg")
            .attr("width", this.plot_width)
            .attr("height", this.plot_height)
            .style("overflow", "visible");

        let return_node = d3.create("div").node();
        return_node.appendChild(this.fancy_frame.node());

        this.projection_g = this.fancy_frame.append("g");

        make_frame(
            this.projection_g,
            0,
            0,
            this.plot_width,
            this.plot_height,
            "Projection View",
            font_size,
            true,
        );

        return return_node;
    }

    draw() {
        let data = this.data;
        let sc = (d, i) => this.c[i];

        console.log(this.node, data, this.x, this.y);

        this.sca = scatter_gl(d3.select(this.node), data, {
            x: (d, i) => this.x[i],
            y: (d, i) => this.y[i],
            s: (d, i) => this.s,
            stroke_width: 0.8,
            width: this.plot_width,
            height: this.plot_height,
            padding_left: this.padding_left,
            padding_right: this.padding_right,
            padding_bottom: this.padding_bottom,
            padding_top: this.padding_top,
            scales: {sc},
            is_square_scale: true,
            dpi_scale: 2.0,
            xticks: this.config.xticks,
            yticks: this.config.yticks,
        });

        this.sca.overlay.selectAll(".tick text").remove();
        define_arrowhead(this.sca.overlay);

        return this.sca;
    }

    init_brush() {
        this.n_boxes = 1;
        this.full_brush_history = [];
        this.sample_brush_history = [];

        this.g_brush = this.sca.overlay.append("g").attr("class", "brush");
        this.g_brush_path = this.sca.overlay.append("g");

        let plot_extent_x = [
            this.padding_left,
            this.plot_width - this.padding_right,
        ];

        let plot_extent_y = [
            this.padding_top,
            this.plot_height - this.padding_bottom,
        ];

        let brush = d3
            .brush()
            .extent([
                [plot_extent_x[0], plot_extent_y[0]],
                [plot_extent_x[1], plot_extent_y[1]],
            ])
            .on("start", (event) => this.brush_start(event))
            .on("brush", (event) => this.brushed(event))
            .on("end", (event) => this.brush_end(event));

        this.g_brush.call(brush);

        this.g_brush.select("rect.selection").attr("stroke", "none");

        return brush;
    }

    brush_start(event) {
        this.full_brush_history = [];
        clear_selected(this.data);

        for (let dimension of Object.values(this.brush_cf_dimensions)) {
            dimension.filterAll();
        }

        this.g_brush.selectAll(".selection").attr("display", null);

        if (event.mode === "handle") {
            this.n_boxes = 1;
            this.g_brush_path.call(clear_path);
        } else if (event.mode === "drag") {
            if (this.brush_mode == "single") {
                this.n_boxes = 1;
            } else if (this.brush_mode == "contrastive") {
                this.n_boxes = 2;
            } else if (this.brush_mode == "curve") {
                this.n_boxes = 12;
            }
        }

        this.controller.on_projection_view_brush_start();
    }

    async brushed(event) {
        console.log("brushed n_boxes:", this.n_boxes);

        if (this.n_boxes > 1 && event.mode !== "drag") {
            return;
        }

        let brushed_region = this.get_brushed_region(
            event.selection,
            this.sca.scales.sx,
            this.sca.scales.sy,
        );

        this.sample_brush_history = update_brush_history(
            this.full_brush_history,
            brushed_region,
            this.n_boxes,
        );

        if (this.n_boxes == 2) {
            this.g_brush_path.call(draw_path, this.sample_brush_history, {
                size: 0,
                "stroke-width": 4,
            });
        } else if (this.n_boxes > 2) {
            this.g_brush_path.call(draw_path, this.sample_brush_history, {
                size: this.full_brush_history[0].brush_size,
                "stroke-width": 4,
            });
        }

        draw_boxes(
            this.sca,
            this.sample_brush_history.map((b) => ({
                x0: b.x_extent[0],
                x1: b.x_extent[1],
                y0: b.y_extent[0],
                y1: b.y_extent[1],
            })),
        );

        this.g_brush.raise();

        if (this.predicate_mode === "data extent") {
            let predicates = this.predicate_engine.compute_predicates(
                this.sample_brush_history,
            );

            if (this.n_boxes == 1) {
                set_selected(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                set_pred(
                    this.data,
                    predicates[predicates.length - 1],
                    this.attributes,
                    this.predicate_cf,
                    this.predicate_cf_dimensions,
                );

                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                update_point_style_gl(this.sca, "confusion");
            } else if (this.n_boxes == 2) {
                set_selected_2(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                update_point_style_gl(this.sca, "contrastive");
            } else {
                set_brushed(
                    this.data,
                    this.sample_brush_history,
                    this.brush_cf,
                    this.brush_cf_dimensions,
                );

                update_point_style_gl(this.sca, "brush");
            }

            this.controller.on_projection_view_change(
                predicates,
                this.data.length,
            );
        }
    }

    async brush_end(event) {
        if (this.n_boxes == 1) {
            set_selected(
                this.data,
                this.sample_brush_history,
                this.brush_cf,
                this.brush_cf_dimensions,
            );
        } else if (this.n_boxes == 2) {
            set_selected_2(
                this.data,
                this.sample_brush_history,
                this.brush_cf,
                this.brush_cf_dimensions,
            );
        }

        set_brushed(
            this.data,
            this.sample_brush_history,
            this.brush_cf,
            this.brush_cf_dimensions,
        );

        // === TEAR-AWARE LOGIC ===
        // Count brushed points directly from the final brush-box coordinates.
        let brushed_points = this.data.filter((d, i) => {
            return this.sample_brush_history.some((box) => {
                let px = this.x[i];
                let py = this.y[i];

                let x0 = Math.min(box.x_extent[0], box.x_extent[1]);
                let x1 = Math.max(box.x_extent[0], box.x_extent[1]);
                let y0 = Math.min(box.y_extent[0], box.y_extent[1]);
                let y1 = Math.max(box.y_extent[0], box.y_extent[1]);

                return px >= x0 && px <= x1 && py >= y0 && py <= y1;
            });
        });

        let brushed_tear_points = brushed_points.filter((d) => {
            return Number(d.tear_flag) === 1;
        });

        let tear_count = brushed_tear_points.length;
        let ratio =
            brushed_points.length > 0 ? tear_count / brushed_points.length : 0;

        console.log(
            "[DimBridge tear-aware] Brushed points:",
            brushed_points.length,
        );

        console.log(
            "[DimBridge tear-aware] Tear points inside selection:",
            tear_count,
        );

        console.log("[DimBridge tear-aware] Tear density:", ratio);

        console.log(
            "[DimBridge tear-aware] Tear rows:",
            brushed_tear_points.map((d) => this.data.indexOf(d)),
        );

        if (event.selection === null) {
            this.sca.overlay.selectAll(".bbox").remove();
            return;
        }

        this.sca.overlay.selectAll(".bbox").remove();

        if (this.n_boxes > 1 && event.mode !== "drag") {
            return;
        } else if (this.n_boxes > 1 && event.mode === "drag") {
            this.g_brush.selectAll(".selection").attr("display", "none");
        }

        this.predicate_engine.compute_predicates(this.sample_brush_history);
    }

    get_brushed_region(selection, sx, sy) {
        let [[x0, y0], [x1, y1]] = selection;

        let cx = (x0 + x1) / 2;
        let cy = (y0 + y1) / 2;

        let brush_size = 1.2 * Math.sqrt(Math.abs((x0 - x1) * (y0 - y1)));

        x0 = sx.invert(x0);
        x1 = sx.invert(x1);
        y0 = sy.invert(y0);
        y1 = sy.invert(y1);

        [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];

        return {x0, x1, y0, y1, cx, cy, brush_size};
    }
}