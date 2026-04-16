export let entry: string;
export namespace output {
    let path: string;
    let filename: string;
}
export let mode: string;
export let devtool: string;
export namespace experiments {
    let asyncWebAssembly: boolean;
}
export namespace module {
    let rules: ({
        test: RegExp;
        use: string;
        exclude: RegExp;
        type?: undefined;
    } | {
        test: RegExp;
        type: string;
        use?: undefined;
        exclude?: undefined;
    } | {
        test: RegExp;
        use: string[];
        exclude?: undefined;
        type?: undefined;
    })[];
}
export namespace resolve {
    let extensions: string[];
}
export let plugins: any[];
export namespace devServer {
    export namespace _static {
        let directory: string;
    }
    export { _static as static };
    export let compress: boolean;
    export let port: number;
    export let hot: boolean;
    export let open: boolean;
}
//# sourceMappingURL=webpack.config.d.ts.map