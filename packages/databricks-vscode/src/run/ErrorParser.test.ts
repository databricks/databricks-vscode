import assert from "assert";
import {parseErrorResult} from "./ErrorParser";

describe(__filename, () => {
    it("should parse error from SyntaxError", () => {
        const repsonse = {
            resultType: "error",
            summary:
                "<span class='ansi-red-fg'>SyntaxError</span>: invalid syntax (hello2.py, line 3)",
            cause: 'Traceback \u001b[0;36m(most recent call last)\u001b[0m:\n\n  File \u001b[1;32m"/databricks/python/lib/python3.9/site-packages/IPython/core/interactiveshell.py"\u001b[0m, line \u001b[1;32m3524\u001b[0m, in \u001b[1;35mrun_code\u001b[0m\n    exec(code_obj, self.user_global_ns, self.user_ns)\n\n  File \u001b[1;32m"<command--1>"\u001b[0m, line \u001b[1;32m43\u001b[0m, in \u001b[1;35m<cell line: 43>\u001b[0m\n    runpy.run_path(python_file, run_name="__main__", init_globals=user_ns)\n\n  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m268\u001b[0m, in \u001b[1;35mrun_path\u001b[0m\n    return _run_module_code(code, init_globals, run_name,\n\n  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m97\u001b[0m, in \u001b[1;35m_run_module_code\u001b[0m\n    _run_code(code, mod_globals, init_globals,\n\n  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m87\u001b[0m, in \u001b[1;35m_run_code\u001b[0m\n    exec(code, run_globals)\n\n  File \u001b[1;32m"/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py"\u001b[0m, line \u001b[1;32m17\u001b[0m, in \u001b[1;35m<module>\u001b[0m\n    import hello2\n\n\u001b[0;36m  File \u001b[0;32m"/databricks/python_shell/dbruntime/PythonPackageImportsInstrumentation/__init__.py"\u001b[0;36m, line \u001b[0;32m171\u001b[0;36m, in \u001b[0;35mimport_patch\u001b[0;36m\u001b[0m\n\u001b[0;31m    original_result = python_builtin_import(name, globals, locals, fromlist, level)\u001b[0m\n\n\u001b[0;36m  File \u001b[0;32m"/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py"\u001b[0;36m, line \u001b[0;32m3\u001b[0m\n\u001b[0;31m    raise Ex ception("juhu")\u001b[0m\n\u001b[0m             ^\u001b[0m\n\u001b[0;31mSyntaxError\u001b[0m\u001b[0;31m:\u001b[0m invalid syntax\n',
        } as const;

        const result = parseErrorResult(repsonse);

        const expected = [
            {text: "Traceback \u001b[0;36m(most recent call last)\u001b[0m:"},
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 268,
                text: '  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m268\u001b[0m, in \u001b[1;35mrun_path\u001b[0m\n    return _run_module_code(code, init_globals, run_name,',
            },
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 97,
                text: '  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m97\u001b[0m, in \u001b[1;35m_run_module_code\u001b[0m\n    _run_code(code, mod_globals, init_globals,',
            },
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 87,
                text: '  File \u001b[1;32m"/usr/lib/python3.9/runpy.py"\u001b[0m, line \u001b[1;32m87\u001b[0m, in \u001b[1;35m_run_code\u001b[0m\n    exec(code, run_globals)',
            },
            {
                file: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py",
                line: 17,
                text: '  File \u001b[1;32m"/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py"\u001b[0m, line \u001b[1;32m17\u001b[0m, in \u001b[1;35m<module>\u001b[0m\n    import hello2',
            },
            {
                file: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py",
                line: 3,
                text: '\u001b[0;36m  File \u001b[0;32m"/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py"\u001b[0;36m, line \u001b[0;32m3\u001b[0m\n\u001b[0;31m    raise Ex ception("juhu")\u001b[0m\n\u001b[0m             ^\u001b[0m\n\u001b[0;31mSyntaxError\u001b[0m\u001b[0;31m:\u001b[0m invalid syntax\n',
            },
        ];

        assert.deepStrictEqual(result, expected);
    });

    it("should parse error from a raised exception", () => {
        const response = {
            resultType: "error",
            summary: "<span class='ansi-red-fg'>Exception</span>: juhu",
            cause: '\u001b[0;31m---------------------------------------------------------------------------\u001b[0m\n\u001b[0;31mException\u001b[0m                                 Traceback (most recent call last)\n\u001b[0;32m<command--1>\u001b[0m in \u001b[0;36m<cell line: 43>\u001b[0;34m()\u001b[0m\n\u001b[1;32m     41\u001b[0m \u001b[0mlogging\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mgetLogger\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"py4j.java_gateway"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0msetLevel\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mlogging\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mERROR\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     42\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m---> 43\u001b[0;31m \u001b[0mrunpy\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mrun_path\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mpython_file\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mrun_name\u001b[0m\u001b[0;34m=\u001b[0m\u001b[0;34m"__main__"\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0minit_globals\u001b[0m\u001b[0;34m=\u001b[0m\u001b[0muser_ns\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\u001b[1;32m     44\u001b[0m \u001b[0;32mNone\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\n\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36mrun_path\u001b[0;34m(path_name, init_globals, run_name)\u001b[0m\n\u001b[1;32m    266\u001b[0m         \u001b[0;31m# execfile() doesn\'t help as we want to allow compiled files\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m    267\u001b[0m         \u001b[0mcode\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mfname\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0m_get_code_from_file\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mrun_name\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mpath_name\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m--> 268\u001b[0;31m         return _run_module_code(code, init_globals, run_name,\n\u001b[0m\u001b[1;32m    269\u001b[0m                                 pkg_name=pkg_name, script_name=fname)\n\u001b[1;32m    270\u001b[0m     \u001b[0;32melse\u001b[0m\u001b[0;34m:\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\n\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36m_run_module_code\u001b[0;34m(code, init_globals, mod_name, mod_spec, pkg_name, script_name)\u001b[0m\n\u001b[1;32m     95\u001b[0m     \u001b[0;32mwith\u001b[0m \u001b[0m_TempModule\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mmod_name\u001b[0m\u001b[0;34m)\u001b[0m \u001b[0;32mas\u001b[0m \u001b[0mtemp_module\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0m_ModifiedArgv0\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mfname\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m:\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     96\u001b[0m         \u001b[0mmod_globals\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mtemp_module\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mmodule\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0m__dict__\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m---> 97\u001b[0;31m         _run_code(code, mod_globals, init_globals,\n\u001b[0m\u001b[1;32m     98\u001b[0m                   mod_name, mod_spec, pkg_name, script_name)\n\u001b[1;32m     99\u001b[0m     \u001b[0;31m# Copy the globals of the temporary module, as they\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\n\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36m_run_code\u001b[0;34m(code, run_globals, init_globals, mod_name, mod_spec, pkg_name, script_name)\u001b[0m\n\u001b[1;32m     85\u001b[0m                        \u001b[0m__package__\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mpkg_name\u001b[0m\u001b[0;34m,\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     86\u001b[0m                        __spec__ = mod_spec)\n\u001b[0;32m---> 87\u001b[0;31m     \u001b[0mexec\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mcode\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mrun_globals\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\u001b[1;32m     88\u001b[0m     \u001b[0;32mreturn\u001b[0m \u001b[0mrun_globals\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     89\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\n\u001b[0;32m/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[1;32m     15\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     16\u001b[0m \u001b[0msys\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mpath\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mappend\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"./sub"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m---> 17\u001b[0;31m \u001b[0;32mimport\u001b[0m \u001b[0mhello2\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\n\u001b[0;32m/databricks/python_shell/dbruntime/PythonPackageImportsInstrumentation/__init__.py\u001b[0m in \u001b[0;36mimport_patch\u001b[0;34m(name, globals, locals, fromlist, level)\u001b[0m\n\u001b[1;32m    169\u001b[0m             \u001b[0;31m# Import the desired module. If you’re seeing this while debugging a failed import,\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m    170\u001b[0m             \u001b[0;31m# look at preceding stack frames for relevant error information.\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m--> 171\u001b[0;31m             \u001b[0moriginal_result\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mpython_builtin_import\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mname\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mglobals\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mlocals\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mfromlist\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mlevel\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\u001b[1;32m    172\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m    173\u001b[0m             \u001b[0mis_root_import\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mthread_local\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0m_nest_level\u001b[0m \u001b[0;34m==\u001b[0m \u001b[0;36m1\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\n\u001b[0;32m/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[1;32m      1\u001b[0m \u001b[0mprint\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"hello2"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m      2\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m----> 3\u001b[0;31m \u001b[0;32mraise\u001b[0m \u001b[0mException\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"juhu"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\n\u001b[0;31mException\u001b[0m: juhu',
        } as const;

        const result = parseErrorResult(response);

        const expected = [
            {
                text: "\u001b[0;31m---------------------------------------------------------------------------\u001b[0m\n\u001b[0;31mException\u001b[0m                                 Traceback (most recent call last)",
            },
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 268,
                text: "\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36mrun_path\u001b[0;34m(path_name, init_globals, run_name)\u001b[0m\n\u001b[1;32m    266\u001b[0m         \u001b[0;31m# execfile() doesn't help as we want to allow compiled files\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m    267\u001b[0m         \u001b[0mcode\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mfname\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0m_get_code_from_file\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mrun_name\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mpath_name\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m--> 268\u001b[0;31m         return _run_module_code(code, init_globals, run_name,\n\u001b[0m\u001b[1;32m    269\u001b[0m                                 pkg_name=pkg_name, script_name=fname)\n\u001b[1;32m    270\u001b[0m     \u001b[0;32melse\u001b[0m\u001b[0;34m:\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m",
            },
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 97,
                text: "\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36m_run_module_code\u001b[0;34m(code, init_globals, mod_name, mod_spec, pkg_name, script_name)\u001b[0m\n\u001b[1;32m     95\u001b[0m     \u001b[0;32mwith\u001b[0m \u001b[0m_TempModule\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mmod_name\u001b[0m\u001b[0;34m)\u001b[0m \u001b[0;32mas\u001b[0m \u001b[0mtemp_module\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0m_ModifiedArgv0\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mfname\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m:\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     96\u001b[0m         \u001b[0mmod_globals\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mtemp_module\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mmodule\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0m__dict__\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m---> 97\u001b[0;31m         _run_code(code, mod_globals, init_globals,\n\u001b[0m\u001b[1;32m     98\u001b[0m                   mod_name, mod_spec, pkg_name, script_name)\n\u001b[1;32m     99\u001b[0m     \u001b[0;31m# Copy the globals of the temporary module, as they\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m",
            },
            {
                file: "/usr/lib/python3.9/runpy.py",
                line: 87,
                text: "\u001b[0;32m/usr/lib/python3.9/runpy.py\u001b[0m in \u001b[0;36m_run_code\u001b[0;34m(code, run_globals, init_globals, mod_name, mod_spec, pkg_name, script_name)\u001b[0m\n\u001b[1;32m     85\u001b[0m                        \u001b[0m__package__\u001b[0m \u001b[0;34m=\u001b[0m \u001b[0mpkg_name\u001b[0m\u001b[0;34m,\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     86\u001b[0m                        __spec__ = mod_spec)\n\u001b[0;32m---> 87\u001b[0;31m     \u001b[0mexec\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0mcode\u001b[0m\u001b[0;34m,\u001b[0m \u001b[0mrun_globals\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0m\u001b[1;32m     88\u001b[0m     \u001b[0;32mreturn\u001b[0m \u001b[0mrun_globals\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     89\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m",
            },
            {
                file: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py",
                line: 17,
                text: '\u001b[0;32m/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/hello.py\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[1;32m     15\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m     16\u001b[0m \u001b[0msys\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mpath\u001b[0m\u001b[0;34m.\u001b[0m\u001b[0mappend\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"./sub"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m---> 17\u001b[0;31m \u001b[0;32mimport\u001b[0m \u001b[0mhello2\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m',
            },
            {
                file: "/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py",
                line: 3,
                text: '\u001b[0;32m/Workspace/Repos/fabian.jakobs@databricks.com/notebook-best-practices/driver/./sub/hello2.py\u001b[0m in \u001b[0;36m<module>\u001b[0;34m\u001b[0m\n\u001b[1;32m      1\u001b[0m \u001b[0mprint\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"hello2"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m\n\u001b[1;32m      2\u001b[0m \u001b[0;34m\u001b[0m\u001b[0m\n\u001b[0;32m----> 3\u001b[0;31m \u001b[0;32mraise\u001b[0m \u001b[0mException\u001b[0m\u001b[0;34m(\u001b[0m\u001b[0;34m"juhu"\u001b[0m\u001b[0;34m)\u001b[0m\u001b[0;34m\u001b[0m\u001b[0;34m\u001b[0m\u001b[0m',
            },
            {text: "\u001b[0;31mException\u001b[0m: juhu"},
        ];

        assert.deepStrictEqual(result, expected);
    });
});
